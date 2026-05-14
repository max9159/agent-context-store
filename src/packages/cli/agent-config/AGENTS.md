# Agent Context Store Instructions

Agent Context Store (`acs`) provides durable project context, SDLC artifacts, and role-based handoffs across agent sessions.

Roles: **BA** (requirements) → **SA** (design) → **DEV** (implementation) → **QA** (testing)

- Run `acs init` if the store is not yet set up in this repo.
- Run `acs status` or `acs handoff list` to resume from a previous session.
- Write durable work context using `acs new`, `acs handoff`, and `acs package` — do not write to artifact directories directly.
- Do not rely on hidden chat memory for requirements, design decisions, approvals, or handoffs.
- When ACS reports context budget risk, follow the active ACS role skill's Context Budget Guard. The CLI advises only; the agent decides semantic phase documents.
- Commit context store changes when the user asks you to persist or hand off work.

When the user asks for requirements, design handoff, SDLC artifacts, context packages, agent-to-agent handoff, role assignment (BA/SA/DEV/QA), or wants to continue from a previous session, follow the full procedure in the agent-context-store skill:

```text
.codex/skills/agent-context-store/SKILL.md
```
