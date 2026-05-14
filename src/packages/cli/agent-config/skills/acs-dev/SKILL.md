---
name: acs-dev
description: ACS Developer role — create implementation notes and hand off to the QA agent. Use when acting as DEV, implementing a feature, or receiving a handoff from SA.
---

# ACS — Developer (DEV) Role

## 0. Detect Entry Mode

```bash
acs status
acs next --role dev --task TASK-123
```

If no SA artifacts exist for the task and the user asked you to start at DEV
(e.g. small fix, prototype), you are the entry role. Switch to relaxed mode
and record the synthetic entry handoff:

```bash
acs handoff create --from system --to dev --task TASK-123 --mode relaxed
acs validate --role dev --task TASK-123 --mode relaxed
```

Otherwise, continue with the SA handoff path below.

## 1. Check the Store

```bash
acs status
acs doctor
```

If an SA handoff exists for this task, read it first:

```bash
acs handoff check --from sa --to dev --task TASK-123
acs package --task TASK-123 --role dev
```

## 2. Context Budget Guard

ACS artifacts are durable handoff documents for the next role agent, not private
notes for the current chat.

Before creating unusually large artifacts, and again before handoff, check the
next role package:

```bash
acs package --task TASK-123 --role qa --format json
```

If `context_budget.risk` is `warning`, `high`, or `split_recommended`, do not
rely on one oversized document. Decide semantic implementation phases and create
or rewrite ACS artifacts as complete phase documents. Each phase document must
include phase goal, scope, required inputs, execution steps, expected outputs,
acceptance criteria, dependencies on other phases, and `source_refs`.

Never split by arbitrary length and never require hidden chat memory.

## 3. Create DEV Artifacts

```bash
acs dev new implementation-note --task TASK-123
acs dev new unit-test-note --task TASK-123
```

**Fill every section immediately** — document implementation decisions, deviations from the design, unit test coverage, and any constraints discovered during development. List consulted files under `source_refs`. Complete the Validation Checklist at the end of each file.

## 4. Validate

```bash
acs validate --role dev --task TASK-123
```

Do not proceed until validation passes.

## 5. Mark Ready for Review

Do not create the QA handoff until all required DEV artifacts are ready for review:

- Implementation note
- Unit test note

Update each DEV artifact frontmatter so `status: ready_for_review`. Keep `approval_status: pending` unless a reviewer explicitly changes it.

Then re-run validation:

```bash
acs validate --role dev --task TASK-123
```

If the work is not ready for review, capture the remaining tasks or blockers in the artifacts and repeat validation before handoff.

## 6. Hand Off to QA

```bash
acs handoff create --from dev --to qa --task TASK-123
acs package --task TASK-123 --role qa
acs index
```

## 7. Output Handoff Prompt

Only after the artifacts are marked ready for review and handoff creation succeeds, end your response with this prompt for the QA agent:

```
[HANDOFF: DEV → QA | TASK-123]

The DEV role has completed implementation for TASK-123.

Artifacts ready for you:
- <path to implementation note>
- <path to unit test note>

Context package: <path printed by acs package>

Your next steps (QA role):
1. Read the context package above.
2. Run: acs role explain qa --task TASK-123
3. Create QA artifacts: acs qa new test-plan --task TASK-123 --title "<title>" and acs qa new qa-signoff --task TASK-123 --title "<title>"
4. Fill all sections, then validate: acs validate --role qa --task TASK-123
5. After approval, mark QA artifacts approved and hand off to SA: acs handoff create --from qa --to sa --task TASK-123

Open questions from DEV (resolve before or during testing):
- <list any open questions from the implementation note>
```
