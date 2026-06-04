# Agent SDLC Pipeline

A reusable multi-agent workflow that drives a change from requirement to commit-ready,
with an independent review gate after **design** and after **code**. Each gate loops back
to its producer on failure. Defined in [`agent-sdlc-pipeline.js`](./agent-sdlc-pipeline.js).

## Flow

```
              ┌──────────────── fail (≤ maxDesignRounds) ───────────────┐
              ▼                                                         │
  [Analyze]                     [Design Review]                        │
  system-analytics  ─────────►  design-review  ──(pass?)───────────────┤
  writes/revises design doc     gates doc → {pass, findings}           │
                                                                   pass ▼
              ┌──────────────── fail (≤ maxDevRounds) ──────────────┐
              ▼                                                     │
  [Develop]                     [Code Review]                      │
  develop-by-plan  ──────────►  code-review  ──(pass?)─────────────┤
  implements per design doc     gates git diff → {pass, findings}  │
                                                               pass ▼
                                              status: ready-to-commit
                                              → main agent asks the user to commit
```

## Stages & agents

| Stage         | Agent              | Responsibility                             | Writes  |
|---------------|--------------------|--------------------------------------------|---------|
| Analyze       | `system-analytics` | Author / revise the Markdown design doc    | `docs/**` |
| Design Review | `design-review`    | Gate the doc, return structured findings   | read-only |
| Develop       | `develop-by-plan`  | Implement the design + tests, run build    | `src/**` |
| Code Review   | `code-review`      | Gate the git diff against the design doc   | read-only |

Reviewers are **read-only by design** — they only produce findings, never edit. Producers
loop until their reviewer passes or the round budget is exhausted.

## Gates

Each reviewer is forced (via JSON schema) to return:

```json
{ "pass": true, "summary": "…", "blockingFindings": [ { "severity": "must-fix|should-fix|nit", "finding": "…", "location": "file:line" } ] }
```

`pass` is `true` **only when there are zero `must-fix` findings**. On a fail, the findings are
fed into the producer's next prompt, and the producer revises. Loops are bounded by
`maxDesignRounds` / `maxDevRounds` (default `5` each) so the pipeline always terminates.

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

| Arg               | Type     | Default                        | Notes                                             |
|-------------------|----------|--------------------------------|---------------------------------------------------|
| `requirement`     | string   | —                              | What to build. **Required** when `startStage` is `analyze`. |
| `designDocPath`   | string   | `docs/fixes/pipeline-design.md`| Doc the stages write / read.                      |
| `startStage`      | string   | `analyze`                      | `analyze` \| `design-review` \| `develop` \| `code-review`. |
| `maxDesignRounds` | number   | `5`                            | Design-review retry budget.                       |
| `maxDevRounds`    | number   | `5`                            | Code-review retry budget.                         |
| `repoDir`         | string   | —                              | Optional working-dir hint passed to agents.       |

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
  "agents": [ { "agent": "system-analytics", "runs": 2, "outputTokens": 41000 } ],
  "totalOutputTokens": 215000,
  "note": "timing caveat"
}
```

- **Per-agent run counts** and **output tokens** are reported. Token figures are exact because
  the pipeline runs strictly sequentially (no overlapping agent calls), so `budget.spent()`
  deltas isolate each agent.
- The workflow never commits. On success it returns `ready-to-commit`; the main agent relays
  the summary and **asks the user to commit**.

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
```

The model invokes it via the Workflow tool (`{ name: "agent-sdlc-pipeline", args: { … } }`).
Watch live progress with `/workflows`.
