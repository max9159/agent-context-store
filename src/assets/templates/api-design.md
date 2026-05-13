---
id: {{ARTIFACT_ID}}
type: api
task_id: {{TASK_ID}}
title: "{{TITLE}}"
owner: sa_agent
status: draft
version: v0.1
approval_status: pending
last_updated: {{DATE}}
source_refs: []
depends_on: []
outputs: []
---

# {{TITLE}}

## API Summary

Describe the API or integration contract in 2–3 sentences. Who calls it, what does it do, and what does the caller receive? (Source: conversation / SRS artifact ID / existing route files you read.)

## Endpoints / Messages

- Name: (human-readable operation name)
- Method: (HTTP verb or message type)
- Path or topic: (exact path or queue/topic name)
- Request: (fields, types, and which are required)
- Response: (fields, types, and status codes)

(Repeat block for each endpoint.)

## Compatibility

- Breaking changes: (list any changes that break existing callers, or "None")
- Migration notes: (steps callers must take, or "Not applicable")
