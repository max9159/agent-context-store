---
name: acs-ba
description: ACS Business Analyst role — capture requirements as SRS, user story, and acceptance criteria artifacts, then hand off to the SA agent. Use when acting as BA, writing requirements, or starting a new task from scratch.
---

# ACS — Business Analyst (BA) Role

## 0. Detect Entry Mode

BA is the canonical entry role, so usually no setup is needed. If `acs status`
shows the task already has artifacts owned by other roles (e.g. SA started
first), you are augmenting an in-progress task — coordinate with the user
before adding BA artifacts.

For a brand-new task, optionally record a synthetic entry handoff so the
audit log reflects the start:

```bash
acs handoff create --from system --to ba --task TASK-123 --mode relaxed
```

## 1. Check the Store

```bash
acs status
acs doctor
```

Fix any errors before continuing.

## 2. Context Budget Guard

ACS artifacts are durable handoff documents for the next role agent, not private
notes for the current chat.

Before creating unusually large artifacts, and again before handoff, check the
next role package:

```bash
acs package --task TASK-123 --role sa --format json
```

If `context_budget.risk` is `warning`, `high`, or `split_recommended`, do not
rely on one oversized document. Decide semantic requirement phases and create or
rewrite ACS artifacts as complete phase documents. Each phase document must
include phase goal, scope, required inputs, execution steps, expected outputs,
acceptance criteria, dependencies on other phases, and `source_refs`.

Never split by arbitrary length and never require hidden chat memory.

## 3. Create BA Artifacts

```bash
acs ba new srs --task TASK-123 --title "Feature requirements"
acs ba new user-story --task TASK-123 --title "Feature user story"
acs ba new acceptance-criteria --task TASK-123 --title "Feature acceptance criteria"
```

**Fill every section immediately** — replace all placeholders with real content from the conversation and source files. List consulted files under `source_refs`. Complete the Validation Checklist at the end of each file.

## 4. Validate

```bash
acs validate --role ba --task TASK-123
```

Do not proceed until validation passes.

## 5. Request Approval

Ask the user or responsible stakeholder to review and approve the BA artifacts before handoff.

Do not create the SA handoff until all required BA artifacts are approved:

- SRS
- User story
- Acceptance criteria

If approval is granted, update each BA artifact frontmatter so `status: approved` and `approval_status: approved`.

Then re-run validation:

```bash
acs validate --role ba --task TASK-123
```

If approval is not granted, capture the requested changes in the artifacts and repeat validation before asking again.

## 6. Hand Off to SA

```bash
acs handoff create --from ba --to sa --task TASK-123
acs package --task TASK-123 --role sa
acs index
```

## 7. Output Handoff Prompt

Only after approval and handoff creation succeed, end your response with this prompt for the SA agent:

```
[HANDOFF: BA → SA | TASK-123]

The BA role has completed and received approval for requirements for TASK-123.

Artifacts ready for you:
- <path to SRS artifact>
- <path to user story artifact>
- <path to acceptance criteria artifact>

Context package: <path printed by acs package>

Your next steps (SA role):
1. Read the context package above.
2. Run: acs role explain sa --task TASK-123
3. Create your design: acs sa new sdd --task TASK-123 --title "<title>"
4. Fill all sections, then validate: acs validate --role sa --task TASK-123
5. When done, hand off to DEV: acs handoff create --from sa --to dev --task TASK-123

Open questions from BA (resolve before or during design):
- <list any open questions from the BA artifacts>
```
