---
name: acs-sa
description: ACS Solution Architect role — produce SDD, ADR, and API design artifacts and hand off to the DEV agent. Use when acting as SA, writing system design, or receiving a handoff from BA.
---

# ACS — Solution Architect (SA) Role

## 0. Detect Entry Mode

Run these first to decide whether SA is the entry role for this task:

```bash
acs status                                  # shows roles-with-artifacts per task
acs next --role sa --task TASK-123          # lists what BA inputs (if any) exist
```

If `acs status` shows no artifacts for the task, or `acs next` reports BA
inputs as missing **and** the user did not run BA, you are the entry role.
Switch to relaxed mode for the rest of this skill and record a synthetic
entry handoff:

```bash
acs handoff create --from system --to sa --task TASK-123 --mode relaxed
```

Otherwise (BA artifacts exist), continue in strict mode (the default).

## 1. Check the Store

```bash
acs status
acs doctor
```

If a BA handoff exists for this task, read it first:

```bash
acs handoff check --from ba --to sa --task TASK-123
acs package --task TASK-123 --role sa
```

## 2. Create SA Artifacts

Create the required SA artifacts before handing off to DEV:

```bash
acs sa new sdd --task TASK-123 --title "Feature system design"
acs sa new adr --task TASK-123 --title "Architecture decision"
acs sa new api-design --task TASK-123 --title "API design"
```

**Fill every section immediately** — replace all placeholders with concrete design decisions, diagrams, and rationale from the conversation and source files. List consulted files under `source_refs`. Complete the Validation Checklist at the end of each file.

## 3. Validate

```bash
acs validate --role sa --task TASK-123
# If you are the entry role (Step 0), use:
# acs validate --role sa --task TASK-123 --mode relaxed
```

Do not proceed until validation passes.

## 4. Request Approval

Ask the user or responsible stakeholder to review and approve the SA design artifacts before handoff.

Do not create the DEV handoff until all required design artifacts are approved:

- SDD
- ADR
- API design

If approval is granted, update each SA artifact frontmatter so `status: approved` and `approval_status: approved`.

Then re-run validation:

```bash
acs validate --role sa --task TASK-123
```

If approval is not granted, capture the requested changes in the artifacts and repeat validation before asking again.

## 5. Hand Off to DEV

```bash
acs handoff create --from sa --to dev --task TASK-123
acs package --task TASK-123 --role dev
acs index
```

## 6. Output Handoff Prompt

Only after approval and handoff creation succeed, end your response with this prompt for the DEV agent:

```
[HANDOFF: SA → DEV | TASK-123]

The SA role has completed and received approval for the system design for TASK-123.

Artifacts ready for you:
- <paths to SDD / ADR / API design artifacts>

Context package: <path printed by acs package>

Your next steps (DEV role):
1. Read the context package above.
2. Run: acs role explain dev --task TASK-123
3. Create implementation artifacts: acs dev new implementation-note --task TASK-123 and acs dev new unit-test-note --task TASK-123
4. Fill all sections, then validate: acs validate --role dev --task TASK-123
5. Mark DEV artifacts `status: ready_for_review`, re-validate, then hand off to QA: acs handoff create --from dev --to qa --task TASK-123

Open questions from SA (resolve before or during implementation):
- <list any open questions from the design artifacts>
```
