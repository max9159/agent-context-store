---
name: acs-sa
description: ACS Solution Architect role — produce SDD, ADR, and API design artifacts and hand off to the DEV agent. Use when acting as SA, writing system design, or receiving a handoff from BA.
---

# ACS — Solution Architect (SA) Role

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

Create one or more of the following based on the task scope:

```bash
acs sa new sdd --task TASK-123 --title "Feature system design"
acs sa new adr --task TASK-123 --title "Architecture decision"
acs sa new api-design --task TASK-123 --title "API design"
```

**Fill every section immediately** — replace all placeholders with concrete design decisions, diagrams, and rationale from the conversation and source files. List consulted files under `source_refs`. Complete the Validation Checklist at the end of each file.

## 3. Validate

```bash
acs validate --role sa --task TASK-123
```

Do not proceed until validation passes.

## 4. Hand Off to DEV

```bash
acs handoff create --from sa --to dev --task TASK-123
acs package --task TASK-123 --role dev
acs index
```

## 5. Output Handoff Prompt

End your response with this prompt for the DEV agent:

```
[HANDOFF: SA → DEV | TASK-123]

The SA role has completed the system design for TASK-123.

Artifacts ready for you:
- <paths to SDD / ADR / API design artifacts>

Context package: <path printed by acs package>

Your next steps (DEV role):
1. Read the context package above.
2. Run: acs role explain dev --task TASK-123
3. Create your implementation note: acs dev new implementation-note --task TASK-123
4. Fill all sections, then validate: acs validate --role dev --task TASK-123
5. When done, hand off to QA: acs handoff create --from dev --to qa --task TASK-123

Open questions from SA (resolve before or during implementation):
- <list any open questions from the design artifacts>
```
