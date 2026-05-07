---
name: acs-qa
description: ACS QA role — create test plans and produce the final validation report. Use when acting as QA, writing test plans, or receiving a handoff from DEV.
---

# ACS — QA Role

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

## 2. Create Test Plan

```bash
acs qa new test-plan --task TASK-123 --title "Feature test plan"
```

**Fill every section immediately** — document test scope, test cases, acceptance criteria, and any risks. List consulted files under `source_refs`. Complete the Validation Checklist at the end of the file.

## 3. Validate

```bash
acs validate --role qa --task TASK-123
acs index
```

## 4. Output Completion Report

QA is the final role in the workflow. End your response with a completion summary:

```
[COMPLETE: QA | TASK-123]

QA has completed the test plan for TASK-123.

Artifacts produced:
- <path to test plan>

Full artifact index: run `acs index` to view all artifacts and handoffs for this task.

Outstanding issues or risks:
- <list any issues found during QA, or "None">
```
