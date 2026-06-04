export const meta = {
  name: 'agent-sdlc-pipeline',
  description: 'SDLC agent pipeline: analyze -> design-review (gate, loop back on fail) -> develop -> code-review (gate, loop back on fail) -> ready-to-commit. Reports per-agent run counts and output tokens. Can start at any stage.',
  phases: [
    { title: 'Analyze', detail: 'system-analytics writes/revises the design doc' },
    { title: 'Design Review', detail: 'design-review gates the doc; fail loops back to Analyze' },
    { title: 'Develop', detail: 'develop-by-plan implements per the design doc' },
    { title: 'Code Review', detail: 'code-review gates the diff; fail loops back to Develop' },
    { title: 'Summary', detail: 'aggregate per-agent runs + tokens' },
  ],
}

// ---------------------------------------------------------------------------
// args (all optional except requirement when starting at 'analyze'):
//   requirement     string   what to build (drives the Analyze stage)
//   designDocPath   string   doc to write/read (default docs/fixes/pipeline-design.md)
//   startStage      string   'analyze' | 'design-review' | 'develop' | 'code-review' (default 'analyze')
//   maxDesignRounds number   design review retry budget (default 3)
//   maxDevRounds    number   code review retry budget (default 3)
//   repoDir         string   repo working dir hint passed to agents (optional)
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

// ---------------------------------------------------------------------------
// Per-agent stats. Token deltas are exact because the pipeline is sequential:
// no two agent() calls overlap, so budget.spent() before/after isolates each.
// ---------------------------------------------------------------------------
const stats = {}
function bump(name, tokensBefore) {
  const s = stats[name] || (stats[name] = { runs: 0, outputTokens: 0 })
  s.runs += 1
  s.outputTokens += budget.spent() - tokensBefore
}
async function step(name, agentType, prompt, opts) {
  const before = budget.spent()
  const res = await agent(prompt, Object.assign({ agentType }, opts || {}))
  bump(name, before)
  return res
}
function agentTable() {
  return Object.keys(stats).map((name) => ({
    agent: name,
    runs: stats[name].runs,
    outputTokens: stats[name].outputTokens,
  }))
}

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pass', 'summary', 'blockingFindings'],
  properties: {
    pass: { type: 'boolean', description: 'true only when there are zero must-fix findings' },
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

// ---------------------------------------------------------------------------
// Design phase: system-analytics (write/revise) -> design-review (gate).
// Loops back to system-analytics on fail, up to MAX_DESIGN rounds.
// ---------------------------------------------------------------------------
let designRounds = 0
let designPassed = false
let lastDesignFindings = []

async function designPhase() {
  // When starting at 'design-review', the first round reviews the existing doc
  // without re-analyzing; otherwise system-analytics produces/revises first.
  let skipAnalyze = START === 'design-review'
  for (let round = 1; round <= MAX_DESIGN; round++) {
    designRounds = round
    if (!skipAnalyze) {
      phase('Analyze')
      const prompt =
        round === 1 && START === 'analyze'
          ? `You are the system-analytics agent. Produce a complete, decision-ready design/development plan as a Markdown document and WRITE it to ${DOC}.${REPO}\n\nRequirement:\n${REQ}\n\nVerify claims against the actual source. Cover: affected files, public API/CLI impact, storage/migration impact, edge cases, a plan-to-test mapping, and verification commands. Return a one-line confirmation with the doc path.`
          : `You are the system-analytics agent. REVISE the design doc at ${DOC} in place to resolve the blocking review findings below. Edit only the Markdown doc (docs/** scope) — do not touch src/.${REPO}\n\nBlocking findings:\n${JSON.stringify(lastDesignFindings, null, 2)}\n\nReturn a one-line summary of what you changed.`
      await step('system-analytics', 'system-analytics', prompt, { phase: 'Analyze', label: `analyze#${round}` })
    }
    skipAnalyze = false

    phase('Design Review')
    const review = await step(
      'design-review',
      'design-review',
      `You are the design-review agent. Review the design doc at ${DOC}${REQ ? ` against this requirement:\n\n${REQ}` : ''}.${REPO}\n\nVerify every load-bearing claim against the actual source (cite file:line). Set pass=true ONLY if there are no must-fix findings. List blocking findings with severity.`,
      { phase: 'Design Review', label: `design-review#${round}`, schema: REVIEW_SCHEMA },
    )
    lastDesignFindings = (review && review.blockingFindings) || []
    if (review && review.pass) {
      log(`Design review round ${round}: PASS`)
      return true
    }
    log(`Design review round ${round}: FAIL (${lastDesignFindings.length} blocking)`)
  }
  return false
}

// ---------------------------------------------------------------------------
// Dev phase: develop-by-plan (implement/fix) -> code-review (gate).
// Loops back to develop-by-plan on fail, up to MAX_DEV rounds.
// ---------------------------------------------------------------------------
let devRounds = 0
let devPassed = false
let lastDevFindings = []

async function devPhase() {
  // When starting at 'code-review', the first round reviews the existing diff
  // without re-developing; otherwise develop-by-plan implements/fixes first.
  let skipDevelop = START === 'code-review'
  for (let round = 1; round <= MAX_DEV; round++) {
    devRounds = round
    if (!skipDevelop) {
      phase('Develop')
      const prompt =
        round === 1 && START !== 'code-review'
          ? `You are the develop-by-plan agent. Implement the approved design doc at ${DOC} exactly.${REPO}\n\nWrite code + tests, run the project's build and test suite, and report results with file:line. Do NOT commit.`
          : `You are the develop-by-plan agent. Fix the code-review blocking findings below in the working tree, then re-run build + tests. Stay aligned with ${DOC}.${REPO}\n\nBlocking findings:\n${JSON.stringify(lastDevFindings, null, 2)}\n\nReport what you changed (file:line) and verification results. Do NOT commit.`
      await step('develop-by-plan', 'develop-by-plan', prompt, { phase: 'Develop', label: `develop#${round}` })
    }
    skipDevelop = false

    phase('Code Review')
    const review = await step(
      'code-review',
      'code-review',
      `You are the code-review agent. Review the uncommitted git changes (git diff) against the design doc at ${DOC}.${REPO}\n\nCheck design alignment + correctness. Set pass=true ONLY if there are no must-fix findings. List blocking findings with file:line.`,
      { phase: 'Code Review', label: `code-review#${round}`, schema: REVIEW_SCHEMA },
    )
    lastDevFindings = (review && review.blockingFindings) || []
    if (review && review.pass) {
      log(`Code review round ${round}: PASS`)
      return true
    }
    log(`Code review round ${round}: FAIL (${lastDevFindings.length} blocking)`)
  }
  return false
}

// ---------------------------------------------------------------------------
// Orchestration: run only the stages at/after startStage.
// ---------------------------------------------------------------------------
const TIMING_NOTE =
  'Per-agent wall-clock time is not measurable inside a workflow script (Date.now/new Date are disabled for resumability). Run counts and output-token deltas are exact (sequential run). Live per-agent timing is in the /workflows view.'

if (startIdx <= STAGES.indexOf('design-review')) {
  designPassed = await designPhase()
  if (!designPassed) {
    phase('Summary')
    return {
      status: 'design-failed',
      reason: `Design review did not pass within ${MAX_DESIGN} rounds.`,
      startStage: START,
      designRounds,
      devRounds,
      designPassed,
      devPassed,
      lastDesignFindings,
      agents: agentTable(),
      totalOutputTokens: budget.spent(),
      note: TIMING_NOTE,
    }
  }
} else {
  designPassed = true // skipped: assumed already approved
}

devPassed = await devPhase()

phase('Summary')
return {
  status: devPassed ? 'ready-to-commit' : 'dev-failed',
  reason: devPassed
    ? 'All gates passed. Awaiting user decision to commit.'
    : `Code review did not pass within ${MAX_DEV} rounds.`,
  startStage: START,
  designDocPath: DOC,
  designRounds,
  devRounds,
  designPassed,
  devPassed,
  lastDesignFindings,
  lastDevFindings,
  agents: agentTable(),
  totalOutputTokens: budget.spent(),
  note: TIMING_NOTE,
}
