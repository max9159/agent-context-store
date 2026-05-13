---
id: {{ARTIFACT_ID}}
type: test
task_id: {{TASK_ID}}
title: "{{TITLE}}"
owner: qa_agent
status: draft
version: v0.1
approval_status: pending
last_updated: {{DATE}}
source_refs: []
depends_on: []
outputs: []
---

# {{TITLE}}

## Test Objective

What does this plan validate? Reference the SRS requirement IDs or SDD sections this plan covers.

## Test Cases

- {{ARTIFACT_ID}}-T001:
  - Given: (precondition — system state before the action)
  - When: (the action or event under test)
  - Then: (expected observable outcome — must be specific and verifiable)

(Add more test cases as needed. Each case must map to at least one requirement or design decision.)

## Evidence

- Execution result: (where to find test run output — e.g., CI job URL, log path)
- Logs or reports: (specific files or dashboards that prove the outcome)

## Validation Checklist

- [ ] Every test case traces to a requirement ID or design decision.
- [ ] Expected results in "Then:" are specific and verifiable.
- [ ] Evidence location is recorded — not left as placeholder.
- [ ] Edge cases and failure paths are included.
