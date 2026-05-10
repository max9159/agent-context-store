---
name: acs-qa
description: ACS QA role — create test plans and produce the final validation report. Use when acting as QA, writing test plans, or receiving a handoff from DEV.
---

# ACS — QA Role

## 0. Detect Entry Mode

```bash
acs status
acs next --role qa --task TASK-123
```

If no DEV/SA artifacts exist and the user asked you to start at QA (e.g.
exploratory test charter, regression sweep on existing code), you are the
entry role. Switch to relaxed mode and record the synthetic entry handoff:

```bash
acs handoff create --from system --to qa --task TASK-123 --mode relaxed
acs validate --role qa --task TASK-123 --mode relaxed
```

Otherwise, continue with the DEV handoff path below.

## 1. Check the Store

```bash
acs status
acs doctor
```

If a DEV handoff exists for this task, read it first:

```bash
acs handoff check --from dev --to qa --task TASK-123
acs package --task TASK-123 --role qa
```

## 2. Create QA Artifacts

```bash
acs qa new test-plan --task TASK-123 --title "Feature test plan"
acs qa new qa-signoff --task TASK-123 --title "Feature QA signoff"
```

**Fill every section immediately** — document test scope, test cases, acceptance criteria, signoff decision, and any risks. List consulted files under `source_refs`. Complete the Validation Checklist at the end of each file.

## 3. Validate

```bash
acs validate --role qa --task TASK-123
```

Do not proceed until validation passes.

## 4. Request Approval

Ask the user or responsible stakeholder to review and approve the QA artifacts before handoff.

Do not create the SA handoff until all required QA artifacts are approved:

- Test plan
- QA signoff

If approval is granted, update each QA artifact frontmatter so `status: approved` and `approval_status: approved`.

Then re-run validation:

```bash
acs validate --role qa --task TASK-123
```

If approval is not granted, capture the requested changes in the artifacts and repeat validation before asking again.

## 5. Hand Off to SA

```bash
acs handoff create --from qa --to sa --task TASK-123
acs package --task TASK-123 --role sa
acs index
```

## 6. Output Handoff Prompt

Only after approval and handoff creation succeed, end your response with this prompt for the SA agent:

```
[HANDOFF: QA → SA | TASK-123]

The QA role has completed and received approval for QA validation for TASK-123.

Artifacts ready for you:
- <path to test plan>
- <path to QA signoff>

Context package: <path printed by acs package>

Your next steps (SA role):
1. Read the context package above.
2. Run: acs role explain sa --task TASK-123
3. Create the release readiness report: acs sa new release-readiness-report --task TASK-123 --title "<title>"
4. Fill all sections, then validate: acs validate --role sa --task TASK-123

Outstanding issues or risks:
- <list any issues found during QA, or "None">
```
