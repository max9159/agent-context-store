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

## Determine the Right Role

If the task role is not yet clear, run:

```bash
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

## Store Maintenance

```bash
acs validate
acs index
acs handoff list --task TASK-123
```
