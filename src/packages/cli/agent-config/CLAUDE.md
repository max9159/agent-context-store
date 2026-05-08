# Claude Code Instructions

Follow [AGENTS.md](AGENTS.md) as the canonical Agent Context Store workflow.

Agent Context Store (`acs`) provides durable project context, SDLC artifacts, and role-based handoffs (BA → SA → DEV → QA) across sessions.

- Run `acs init` if the store is not yet set up in this repo.
- Run `acs status` or `acs handoff list` to resume from a previous session.
- Put durable context in ACS artifacts instead of relying on hidden session state.

When the user asks for requirements, design handoff, SDLC artifacts, context packages, role assignment (BA/SA/DEV/QA), or wants to continue from a previous session, use the project skill at:

```text
.claude/skills/agent-context-store/SKILL.md
```
