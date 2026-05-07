---
name: acs-dev
description: ACS Developer role — create implementation notes and hand off to the QA agent. Use when acting as DEV, implementing a feature, or receiving a handoff from SA.
---

# ACS — Developer (DEV) Role

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

## 2. Create Implementation Note

```bash
acs dev new implementation-note --task TASK-123
```

**Fill every section immediately** — document implementation decisions, deviations from the design, and any constraints discovered during development. List consulted files under `source_refs`. Complete the Validation Checklist at the end of the file.

## 3. Validate

```bash
acs validate --role dev --task TASK-123
```

Do not proceed until validation passes.

## 4. Hand Off to QA

```bash
acs handoff create --from dev --to qa --task TASK-123
acs package --task TASK-123 --role qa
acs index
```

## 5. Output Handoff Prompt

End your response with this prompt for the QA agent:

```
[HANDOFF: DEV → QA | TASK-123]

The DEV role has completed implementation for TASK-123.

Artifacts ready for you:
- <path to implementation note>

Context package: <path printed by acs package>

Your next steps (QA role):
1. Read the context package above.
2. Run: acs role explain qa --task TASK-123
3. Create your test plan: acs qa new test-plan --task TASK-123 --title "<title>"
4. Fill all sections, then validate: acs validate --role qa --task TASK-123

Open questions from DEV (resolve before or during testing):
- <list any open questions from the implementation note>
```
