---
name: agent-context-store
description: ACS store setup, health checks, and role discovery. Use when initialising the store, checking store status, or when the role for the current task is not yet determined. For role-specific work use the acs-ba, acs-sa, acs-dev, or acs-qa skills instead.
---

# Agent Context Store — Setup & Health

Use `acs` to make agent work durable and reviewable across roles and sessions.

## Store Setup

```bash
acs init                        # in-repo mode (default)
acs init --mode local           # local user-data mode
acs init --mode dedicated       # dedicated store repo
```

## Health Checks

```bash
acs status
acs doctor
acs roles
```

Fix any errors before creating artifacts or handoffs.

## Context Budget Advisory

`acs package` reports context budget risk for the next role. The CLI only
estimates and advises; it never splits files or rewrites artifacts.

When a package reports `warning`, `high`, or `split_recommended`, switch to the
active role skill and follow its Context Budget Guard. The agent must decide
semantic phase documents; do not depend on hidden chat memory or oversized
single artifacts.

## Determine the Right Role

If the task role is not yet clear, run:

```bash
acs status                                           # lists tasks + roles-with-artifacts + suggested-next
acs next --role <ba|sa|dev|qa> --task TASK-123
acs role explain <role> --task TASK-123
```

Then switch to the matching role skill:

| Role | Skill to use |
|------|-------------|
| Business Analyst | `acs-ba` |
| Solution Architect | `acs-sa` |
| Developer | `acs-dev` |
| QA | `acs-qa` |

## Entry-Role Mode (`--mode relaxed`)

ACS allows **any role** to be the workflow entry. When you start a task at SA,
DEV, or QA without prior upstream artifacts, use `--mode relaxed` so missing
inputs are downgraded from errors to warnings + AI hints, and create a
synthetic entry handoff so the audit trail is complete:

```bash
acs handoff create --from system --to <role> --task TASK-123 --mode relaxed
acs validate --role <role> --task TASK-123 --mode relaxed
acs next --role <role> --task TASK-123 --mode relaxed
```

Default is `--mode strict`, which preserves the canonical BA → SA → DEV → QA
gate. Use strict whenever the upstream artifacts already exist.

## Working Log

Every artifact create / handoff / package / index event is appended as JSONL
to `audit/{YYYY-MM-DD}.log` (daily rollup) and `audit/tasks/{TASK_ID}.jsonl`
(per-task working log). Reads are atomic and concurrency-safe.

```bash
acs log --task TASK-123                # human-readable, all events
acs log --task TASK-123 --tail 20      # last N events
acs log --task TASK-123 --json         # full structured events
```

Set `ACS_SESSION_ID` in the environment to tag every event from one agent
run; otherwise the CLI auto-generates one per invocation.

## Store Maintenance

```bash
acs validate
acs index
acs handoff list --task TASK-123
```
