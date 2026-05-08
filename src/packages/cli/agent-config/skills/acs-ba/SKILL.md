---
name: acs-ba
description: ACS Business Analyst role — capture requirements as SRS, user story, and acceptance criteria artifacts, then hand off to the SA agent. Use when acting as BA, writing requirements, or starting a new task from scratch.
---

# ACS — Business Analyst (BA) Role

## 1. Check the Store

```bash
acs status
acs doctor
```

Fix any errors before continuing.

## 2. Create BA Artifacts

```bash
acs ba new srs --task TASK-123 --title "Feature requirements"
acs ba new user-story --task TASK-123 --title "Feature user story"
acs ba new acceptance-criteria --task TASK-123 --title "Feature acceptance criteria"
```

**Fill every section immediately** — replace all placeholders with real content from the conversation and source files. List consulted files under `source_refs`. Complete the Validation Checklist at the end of each file.

## 3. Validate

```bash
acs validate --role ba --task TASK-123
```

Do not proceed until validation passes.

## 4. Hand Off to SA

```bash
acs handoff create --from ba --to sa --task TASK-123
acs package --task TASK-123 --role sa
acs index
```

## 5. Output Handoff Prompt

End your response with this prompt for the SA agent:

```
[HANDOFF: BA → SA | TASK-123]

The BA role has completed requirements for TASK-123.

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
