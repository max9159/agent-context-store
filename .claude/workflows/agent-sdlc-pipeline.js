export const meta = {
  name: 'agent-sdlc-pipeline',
  description: 'SDLC agent pipeline with intra-stage fan-out: analyze (parallel research vectors -> single synthesis writer) -> design-review (parallel lenses, gate) -> develop (single writer) -> code-review (parallel lenses, gate) -> ready-to-commit. Gates loop back on fail. Reports per-role run counts and per-stage output tokens. Can start at any stage.',
  phases: [
    { title: 'Analyze', detail: 'parallel read-only research vectors, then one synthesis writer produces the design doc' },
    { title: 'Design Review', detail: 'parallel review lenses; merge+dedupe; fail loops back to Analyze' },
    { title: 'Develop', detail: 'develop-by-plan implements per the design doc (single writer)' },
    { title: 'Code Review', detail: 'parallel review lenses on the diff; merge+dedupe; fail loops back to Develop' },
    { title: 'Summary', detail: 'aggregate per-role runs + per-stage tokens' },
  ],
}

// ---------------------------------------------------------------------------
// args (all optional except requirement when starting at 'analyze'):
//   requirement      string    what to build (drives the Analyze stage)
//   designDocPath    string    doc to write/read (default docs/fixes/pipeline-design.md)
//   startStage       string    'analyze' | 'design-review' | 'develop' | 'code-review'
//   maxDesignRounds  number    design review retry budget (default 5)
//   maxDevRounds     number    code review retry budget (default 5)
//   repoDir          string    repo working dir hint passed to agents
//   analysisVectors  string[]  Analyze fan-out dimensions (read-only research)
//   designLenses     string[]  Design Review fan-out lenses
//   codeLenses       string[]  Code Review fan-out lenses
// ---------------------------------------------------------------------------
const STAGES = ['analyze', 'design-review', 'develop', 'code-review']
const START = (args && args.startStage) || 'analyze'
const startIdx = STAGES.indexOf(START)
if (startIdx < 0) throw new Error(`Invalid startStage "${START}". Expected one of ${STAGES.join(', ')}.`)

const REQ = (args && args.requirement) || ''
const DOC = (args && args.designDocPath) || 'docs/fixes/pipeline-design.md'
const MAX_DESIGN = (args && args.maxDesignRounds) || 5
const MAX_DEV = (args && args.maxDevRounds) || 5
const REPO = (args && args.repoDir) ? `\nRepo working dir: ${args.repoDir}` : ''

if (START === 'analyze' && !REQ) {
  throw new Error('startStage "analyze" requires args.requirement (what to build).')
}

// --- fan-out dimensions (read-only research vectors / review lenses) --------
function normalizeList(list, fallback) {
  const src = Array.isArray(list) && list.length ? list : fallback
  return src.map((x, i) =>
    typeof x === 'string'
      ? { key: x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24) || `v${i}`, prompt: x }
      : x,
  )
}
const ANALYSIS_VECTORS = normalizeList(args && args.analysisVectors, [
  'requirements and scope',
  'existing-code reuse and architecture fit',
  'storage, migration, and path semantics',
  'public API and CLI contract, backward compatibility',
  'edge cases, failure modes, and test strategy',
])
const DESIGN_LENSES = normalizeList(args && args.designLenses, [
  'correctness and logic conflicts',
  'public API / CLI contract and backward compatibility',
  'storage, migration, and path semantics',
  'test coverage and plan-to-test mapping',
  'simplicity and over-engineering',
])
const CODE_LENSES = normalizeList(args && args.codeLenses, [
  'correctness and design alignment',
  'public API / CLI contract and backward compatibility',
  'storage, migration, and path semantics',
  'test coverage',
  'simplicity and over-engineering',
])

// ---------------------------------------------------------------------------
// Stats. With intra-stage fan-out, concurrent agent() calls share the
// budget.spent() window, so per-individual-agent tokens are NOT separable.
// We therefore report: run COUNT per role (exact), and output TOKENS per
// STAGE (delta around each stage's work — exact at stage granularity).
// ---------------------------------------------------------------------------
const roleRuns = {}
const stageTokens = {}
function note(role, n) {
  roleRuns[role] = (roleRuns[role] || 0) + (n || 1)
}
async function callAgent(role, prompt, opts) {
  note(role)
  return agent(prompt, Object.assign({ agentType: role }, opts || {}))
}
async function tokenedStage(stageTitle, fn) {
  const before = budget.spent()
  const res = await fn()
  stageTokens[stageTitle] = (stageTokens[stageTitle] || 0) + (budget.spent() - before)
  return res
}

const NOTES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['vector', 'findings'],
  properties: {
    vector: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
  },
}
const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pass', 'summary', 'blockingFindings'],
  properties: {
    pass: { type: 'boolean', description: 'true only when this lens found zero must-fix issues' },
    summary: { type: 'string' },
    blockingFindings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'finding'],
        properties: {
          severity: { type: 'string', enum: ['must-fix', 'should-fix', 'nit'] },
          finding: { type: 'string' },
          location: { type: 'string', description: 'file:line if applicable' },
        },
      },
    },
  },
}

function dedupeFindings(findings) {
  const seen = new Set()
  const out = []
  for (const f of findings) {
    if (!f || !f.finding) continue
    const key = `${f.severity}|${(f.location || '').trim()}|${f.finding.trim().slice(0, 120)}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push(f)
    }
  }
  return out
}

// Fan-out review gate: run all lenses concurrently (read-only), merge + dedupe
// findings, pass only when zero must-fix across the union.
async function reviewGate(stageTitle, role, lenses, makePrompt, round) {
  let findings = []
  await tokenedStage(stageTitle, async () => {
    const reviews = await parallel(
      lenses.map((lens) => () =>
        callAgent(role, makePrompt(lens), {
          phase: stageTitle,
          label: `${stageTitle === 'Design Review' ? 'design' : 'code'}:${lens.key}#${round}`,
          schema: REVIEW_SCHEMA,
        }),
      ),
    )
    findings = dedupeFindings(reviews.filter(Boolean).flatMap((r) => (r && r.blockingFindings) || []))
  })
  const passed = !findings.some((f) => f.severity === 'must-fix')
  return { passed, findings }
}

// ---------------------------------------------------------------------------
// Design phase: Analyze (fan-out vectors -> single synthesis writer) ->
// Design Review (fan-out lenses, gate). Loops back to Analyze on fail.
// ---------------------------------------------------------------------------
let designRounds = 0
let designPassed = false
let lastDesignFindings = []

async function designPhase() {
  let skipAnalyze = START === 'design-review'
  for (let round = 1; round <= MAX_DESIGN; round++) {
    designRounds = round
    if (!skipAnalyze) {
      phase('Analyze')
      await tokenedStage('Analyze', async () => {
        if (round === 1 && START === 'analyze') {
          // Fan out READ-ONLY research vectors (no writes — avoids clobbering the doc).
          const notes = await parallel(
            ANALYSIS_VECTORS.map((v) => () =>
              callAgent(
                'system-analytics',
                `You are the system-analytics agent acting as a focused analyst. Analyze ONLY the "${v.prompt}" dimension of this requirement against the actual source (cite file:line). Do NOT write any files — return structured notes only.${REPO}\n\nRequirement:\n${REQ}`,
                { phase: 'Analyze', label: `analyze:${v.key}`, schema: NOTES_SCHEMA },
              ),
            ),
          )
          // SINGLE synthesis writer composes the design doc from all vectors.
          await callAgent(
            'system-analytics',
            `You are the system-analytics agent. Synthesize the per-dimension analysis notes below into a single, decision-ready design/development plan and WRITE it to ${DOC} (docs/** scope only).${REPO}\n\nRequirement:\n${REQ}\n\nPer-dimension notes:\n${JSON.stringify(notes, null, 2)}\n\nCover affected files, public API/CLI impact, storage/migration impact, edge cases, a plan-to-test mapping, and verification commands. Return a one-line confirmation with the doc path.`,
            { phase: 'Analyze', label: 'analyze:synthesize' },
          )
        } else {
          // Revise round: single writer addresses the merged review findings.
          await callAgent(
            'system-analytics',
            `You are the system-analytics agent. REVISE the design doc at ${DOC} in place to resolve the blocking review findings below. Edit only the Markdown doc (docs/** scope) — do not touch src/.${REPO}\n\nBlocking findings:\n${JSON.stringify(lastDesignFindings, null, 2)}\n\nReturn a one-line summary of what you changed.`,
            { phase: 'Analyze', label: `analyze:revise#${round}` },
          )
        }
      })
    }
    skipAnalyze = false

    phase('Design Review')
    const { passed, findings } = await reviewGate(
      'Design Review',
      'design-review',
      DESIGN_LENSES,
      (lens) =>
        `You are the design-review agent. Review the design doc at ${DOC} THROUGH ONE LENS: "${lens.prompt}".${REQ ? `\n\nRequirement:\n${REQ}` : ''}${REPO}\n\nVerify load-bearing claims against the actual source (cite file:line). Set pass=true only if THIS lens finds zero must-fix issues. List blocking findings with severity.`,
      round,
    )
    lastDesignFindings = findings
    if (passed) {
      log(`Design review round ${round}: PASS (${DESIGN_LENSES.length} lenses, 0 must-fix)`)
      return true
    }
    log(`Design review round ${round}: FAIL (${findings.length} blocking across ${DESIGN_LENSES.length} lenses)`)
  }
  return false
}

// ---------------------------------------------------------------------------
// Dev phase: Develop (single writer) -> Code Review (fan-out lenses, gate).
// Loops back to Develop on fail.
// ---------------------------------------------------------------------------
let devRounds = 0
let devPassed = false
let lastDevFindings = []

async function devPhase() {
  let skipDevelop = START === 'code-review'
  for (let round = 1; round <= MAX_DEV; round++) {
    devRounds = round
    if (!skipDevelop) {
      phase('Develop')
      await tokenedStage('Develop', async () => {
        // Single writer — never fanned out (parallel writers would clobber the working tree).
        const prompt =
          round === 1 && START !== 'code-review'
            ? `You are the develop-by-plan agent. Implement the approved design doc at ${DOC} exactly.${REPO}\n\nWrite code + tests, run the project's build and test suite, and report results with file:line. Do NOT commit.`
            : `You are the develop-by-plan agent. Fix the code-review blocking findings below in the working tree, then re-run build + tests. Stay aligned with ${DOC}.${REPO}\n\nBlocking findings:\n${JSON.stringify(lastDevFindings, null, 2)}\n\nReport what you changed (file:line) and verification results. Do NOT commit.`
        await callAgent('develop-by-plan', prompt, { phase: 'Develop', label: `develop#${round}` })
      })
    }
    skipDevelop = false

    phase('Code Review')
    const { passed, findings } = await reviewGate(
      'Code Review',
      'code-review',
      CODE_LENSES,
      (lens) =>
        `You are the code-review agent. Review the uncommitted git changes (git diff) against the design doc at ${DOC} THROUGH ONE LENS: "${lens.prompt}".${REPO}\n\nCite file:line. Set pass=true only if THIS lens finds zero must-fix issues. List blocking findings.`,
      round,
    )
    lastDevFindings = findings
    if (passed) {
      log(`Code review round ${round}: PASS (${CODE_LENSES.length} lenses, 0 must-fix)`)
      return true
    }
    log(`Code review round ${round}: FAIL (${findings.length} blocking across ${CODE_LENSES.length} lenses)`)
  }
  return false
}

// ---------------------------------------------------------------------------
// Orchestration: stages run sequentially (dependency chain); fan-out is
// intra-stage only. Run only the stages at/after startStage.
// ---------------------------------------------------------------------------
const TIMING_NOTE =
  'Tokens are reported PER STAGE (concurrent fan-out within a stage shares the budget window, so per-individual-agent tokens are not separable). Run counts are per role. Per-agent wall-clock time is not measurable inside a workflow script (Date.now/new Date disabled for resumability) — see /workflows for live timing.'
const FANOUT = {
  analysisVectors: ANALYSIS_VECTORS.map((v) => v.key),
  designLenses: DESIGN_LENSES.map((l) => l.key),
  codeLenses: CODE_LENSES.map((l) => l.key),
}

function summary(status, reason) {
  return {
    status,
    reason,
    startStage: START,
    designDocPath: DOC,
    designRounds,
    devRounds,
    designPassed,
    devPassed,
    lastDesignFindings,
    lastDevFindings,
    fanout: FANOUT,
    agentRuns: roleRuns,
    stageTokens,
    totalOutputTokens: budget.spent(),
    note: TIMING_NOTE,
  }
}

if (startIdx <= STAGES.indexOf('design-review')) {
  designPassed = await designPhase()
  if (!designPassed) {
    phase('Summary')
    return summary('design-failed', `Design review did not pass within ${MAX_DESIGN} rounds.`)
  }
} else {
  designPassed = true // skipped: assumed already approved
}

devPassed = await devPhase()

phase('Summary')
return summary(
  devPassed ? 'ready-to-commit' : 'dev-failed',
  devPassed
    ? 'All gates passed. Awaiting user decision to commit.'
    : `Code review did not pass within ${MAX_DEV} rounds.`,
)
