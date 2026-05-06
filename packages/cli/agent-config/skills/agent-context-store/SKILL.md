---
name: agent-context-store
description: Create and validate Agent Context Store artifacts, handoffs, and role-specific context packages with the acs CLI. Use when the user asks for durable agent context, SDLC artifacts, requirements/design/test handoff, context packages, or agent-to-agent handoff workflow.
---

# Agent Context Store CLI

Use `acs` to make agent work durable and reviewable.

## Check The Store

Run from the context store root or project root:

```bash
acs doctor
acs validate
```

If validation fails, report the errors before creating handoffs or packages.

## Create Task Artifacts

Use a stable task ID from the ticket, branch, issue, or user request.

```bash
acs new srs --task TASK-123 --title "Feature requirements"
acs new sdd --task TASK-123 --title "Feature system design"
acs new adr --task TASK-123 --title "Feature architecture decision"
acs new api --task TASK-123 --title "Feature API design"
acs new test --task TASK-123 --title "Feature test plan"
```

Edit the generated Markdown files with the actual requirements, decisions, source references, risks, and test scope.

## Create Handoffs

```bash
acs handoff create --from ba --to sa --task TASK-123
acs handoff create --from sa --to dev --task TASK-123
acs handoff create --from dev --to qa --task TASK-123
```

Check a handoff before relying on it:

```bash
acs handoff check HOFF-TASK-123-BA-SA
```

## Package Context

Generate role-specific context before passing work to another agent:

```bash
acs package --task TASK-123 --role sa
acs package --task TASK-123 --role dev
acs package --task TASK-123 --role qa
acs index
```

Use `acs package --task TASK-123 --role dev --format json` for automation.

## Completion Checklist

- Run `acs validate`.
- Run `acs index` after changing artifacts or handoffs.
- Report created or updated artifact, handoff, and package paths.
- Call out open questions and validation warnings.
