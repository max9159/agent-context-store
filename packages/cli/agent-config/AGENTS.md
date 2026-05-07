# Agent Context Store Instructions

Use Agent Context Store (`acs`) for durable project context, SDLC artifacts, and role handoffs.

## Scope

- Treat this repository as the context store, or as the project that owns `.acs/` (in-repo mode).
- Write durable work context using `acs new`, `acs handoff`, and `acs package` — do not write to artifact directories directly.
- Do not rely on hidden chat memory for requirements, design decisions, approvals, or handoffs.
- Commit context store changes when the user asks you to persist or hand off work.

## Before Work

```bash
acs status
acs doctor
```

If validation fails, report the issue before creating new handoffs or packages.

## Create Artifacts

Use the task ID from the user, issue, ticket, branch, or commit context.

```bash
acs new srs --task TASK-123 --title "Feature requirements"
acs new sdd --task TASK-123 --title "Feature system design"
acs new adr --task TASK-123 --title "Feature architecture decision"
acs new api --task TASK-123 --title "Feature API design"
acs new test --task TASK-123 --title "Feature test plan"
```

Update the generated Markdown files with concise, reviewable content and source references.

## Handoff Flow

```bash
acs handoff create --from ba --to sa --task TASK-123
acs handoff create --from sa --to dev --task TASK-123
acs handoff create --from dev --to qa --task TASK-123
```

Check handoffs before using them:

```bash
acs handoff check HOFF-TASK-123-BA-SA
```

## Context Packages

Generate a role-specific package before handing work to the next agent.

```bash
acs package --task TASK-123 --role sa
acs package --task TASK-123 --role dev
acs package --task TASK-123 --role qa
acs index
```

Use `--format json` when downstream automation needs structured output.

## Finish Work

- Run `acs validate`.
- Run `acs index` after material artifact or handoff changes.
- Summarize created or updated artifacts and packages.
- Mention any open questions or validation warnings.
