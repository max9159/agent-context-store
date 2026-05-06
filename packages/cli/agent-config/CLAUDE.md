# Claude Code Instructions

Follow [AGENTS.md](AGENTS.md) as the canonical Agent Context Store workflow.

When the user asks for requirements, design handoff, SDLC artifacts, context packages, or durable agent memory, use the project skill at:

```text
.claude/skills/agent-context-store/SKILL.md
```

Keep chat summaries short and put durable context in Agent Context Store artifacts instead of relying on hidden session state.
