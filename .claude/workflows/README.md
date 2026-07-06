# Agent SDLC Pipeline

A reusable multi-agent workflow that drives a change from requirement to commit-ready,
with an independent review gate after **design** and after **code**. Each gate loops back
to its producer on failure. Defined in [`agent-sdlc-pipeline.js`](./agent-sdlc-pipeline.js).

Stages run **sequentially** (a dependency chain), but each stage **fans out concurrently**
internally: multiple read-only agents work different angles at once, then results are
synthesized or merged. The one exception is **Develop**, which stays a single writer.

## Flow

```
              ┌───────────────────── fail (≤ maxDesignRounds) ──────────────────────┐
              ▼                                                                      │
  [Analyze]                                            [Design Review]               │
  ┌─ system-analytics × N vectors (parallel, RO) ┐     ┌─ design-review × N lenses ┐ │
  │  requirements · reuse · storage · api · …     │     │ (parallel, read-only)     │ │
  └────────────────────┬─────────────────────────┘     └─────────────┬─────────────┘ │
            1 synthesis writer ──► design doc ──────────►  merge+dedupe → (pass?) ────┤
                                                                                 pass ▼
              ┌───────────────────── fail (≤ maxDevRounds) ─────────────────────┐
              ▼                                                                  │
  [Develop]                                            [Code Review]             │
  develop-by-plan (SINGLE writer) ──► working tree ──► ┌─ code-review × N lenses ┐│
                                                       │ (parallel, read-only)   ││
                                                       └────────────┬────────────┘│
                                                          merge+dedupe → (pass?) ──┤
                                                                              pass ▼
                                                          status: ready-to-commit
                                                          → main agent asks the user to commit
```

## Stages & agents

| Stage         | Agent              | Fan-out                                      | Writes  |
|---------------|--------------------|----------------------------------------------|---------|
| Analyze       | `system-analytics` | N read-only vectors → **1** synthesis writer | `docs/**` (synthesis step only) |
| Design Review | `design-review`    | N lenses in parallel → merge + dedupe        | read-only |
| Develop       | `develop-by-plan`  | **none** — single writer                     | `src/**` |
| Code Review   | `code-review`      | N lenses in parallel → merge + dedupe        | read-only |

### Why fan out readers but not the developer

The risk with concurrency is **concurrent writes to the same artifact**, not concurrency
itself. So:

- **Analyze** fans out *read-only analysts* (each returns notes, writes nothing); a **single**
  `system-analytics` step then writes the doc from the merged notes.
- **Reviews** are read-only, so lenses run in parallel freely.
- **Develop** must write code, so it stays a **single writer** — parallel devs would clobber
  the working tree. (Splitting it would require per-agent `worktree` isolation + a merge step;
  not done here.)

## Gates

Each review lens is forced (via JSON schema) to return:

```json
{ "pass": true, "summary": "…", "blockingFindings": [ { "severity": "must-fix|should-fix|nit", "finding": "…", "location": "file:line" } ] }
```

Findings from all lenses are **merged and deduped**; the gate **passes only when zero
`must-fix` findings remain across the union**. On a fail, the merged findings are fed into the
producer's next prompt. Loops are bounded by `maxDesignRounds` / `maxDevRounds` (default `5`
each) so the pipeline always terminates.

> On revise rounds the Analyze stage runs a **single** revise step (it does not re-fan-out the
> vectors) — the full vector sweep happens once on round 1.

## Start at any stage

`startStage` selects the entry point; earlier stages are skipped. When entering directly at a
**review** stage, the first round reviews the *existing* artifact without re-running its producer.

| `startStage`    | Behavior                                                                 |
|-----------------|--------------------------------------------------------------------------|
| `analyze`       | Full pipeline (default). Requires `requirement`.                         |
| `design-review` | Review the existing doc first; loop back to `system-analytics` on fail.  |
| `develop`       | Implement from the existing doc; then code-review gate.                  |
| `code-review`   | Review the existing diff first; loop back to `develop-by-plan` on fail.  |

## Arguments

Pass as the `args` object when invoking the workflow.

| Arg               | Type       | Default                         | Notes                                             |
|-------------------|------------|---------------------------------|---------------------------------------------------|
| `requirement`     | string     | —                               | What to build. **Required** when `startStage` is `analyze`. |
| `designDocPath`   | string     | `docs/fixes/pipeline-design.md` | Doc the stages write / read.                      |
| `startStage`      | string     | `analyze`                       | `analyze` \| `design-review` \| `develop` \| `code-review`. |
| `maxDesignRounds` | number     | `5`                             | Design-review retry budget.                       |
| `maxDevRounds`    | number     | `5`                             | Code-review retry budget.                         |
| `repoDir`         | string     | —                               | Optional working-dir hint passed to agents.       |
| `analysisVectors` | string[]   | requirements / reuse / storage / api / edge-tests | Analyze fan-out dimensions (read-only research). |
| `designLenses`    | string[]   | correctness / api-compat / storage / tests / simplicity | Design Review fan-out lenses. |
| `codeLenses`      | string[]   | correctness / api-compat / storage / tests / simplicity | Code Review fan-out lenses. |

Each vector/lens spawns one concurrent agent for that stage-round, so list length controls
fan width (and cost). The runtime caps real concurrency at ~`min(16, cores−2)`.

## Preconditions (when starting mid-pipeline)

These are **assumptions, not enforced by the script** — satisfy them yourself:

- Starting at `design-review` / `develop` / `code-review` assumes the design doc already
  exists at `designDocPath`.
- Starting at `code-review` assumes the working tree already has the uncommitted changes
  to review.

## Output summary

On completion the workflow returns an object the main agent renders for you:

```json
{
  "status": "ready-to-commit | design-failed | dev-failed",
  "startStage": "…",
  "designDocPath": "…",
  "designRounds": 1,
  "devRounds": 2,
  "designPassed": true,
  "devPassed": true,
  "lastDesignFindings": [],
  "lastDevFindings": [],
  "fanout": { "analysisVectors": ["…"], "designLenses": ["…"], "codeLenses": ["…"] },
  "agentRuns": { "system-analytics": 6, "design-review": 5, "develop-by-plan": 2, "code-review": 10 },
  "stageTokens": { "Analyze": 80000, "Design Review": 55000, "Develop": 120000, "Code Review": 90000 },
  "totalOutputTokens": 345000,
  "note": "attribution caveat"
}
```

### Token attribution (changed by fan-out)

Because lenses/vectors run **concurrently**, `budget.spent()` before/after can no longer isolate
a *single* agent within a stage. So the summary reports:

- **`agentRuns`** — run **count per role** (exact; each `agent()` call counted).
- **`stageTokens`** — output **tokens per stage** (exact at stage granularity — the delta around
  each stage's whole fan-out).

Per-individual-subagent token splits inside a parallel batch are not separable.

### Timing caveat

Per-agent **wall-clock time is not measurable inside a workflow script** — `Date.now()` /
`new Date()` are disabled there so runs stay resumable. Live per-agent timing is shown in the
`/workflows` view, and total duration arrives in the completion notification.

## How to run

```
Run the agent-sdlc-pipeline workflow with:
  requirement: "<what to build>"
  startStage:  "analyze"          # or design-review | develop | code-review
  designDocPath: "docs/fixes/<name>.md"
  # optional: analysisVectors / designLenses / codeLenses to tune fan-out width
```

The model invokes it via the Workflow tool (`{ name: "agent-sdlc-pipeline", args: { … } }`).
Watch live progress with `/workflows`.
