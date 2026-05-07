# Agent Context Store Instructions

Use Agent Context Store (`acs`) for durable project context, SDLC artifacts, and role handoffs.

- Write durable work context using `acs new`, `acs handoff`, and `acs package` — do not write to artifact directories directly.
- Do not rely on hidden chat memory for requirements, design decisions, approvals, or handoffs.
- Commit context store changes when the user asks you to persist or hand off work.

When the user asks for requirements, design handoff, SDLC artifacts, context packages, or agent-to-agent handoff, follow the full procedure in the agent-context-store skill:

```text
.agents/skills/agent-context-store/SKILL.md
```
