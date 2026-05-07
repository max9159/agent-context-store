---
name: develop-by-plan
description: Implements an approved plan exactly, tracking todos, preserving scope, updating tests/docs, and verifying results. Use when the user asks to implement an attached or approved plan.
disable-model-invocation: true
---

# Develop By Plan

## Instructions

Use this skill when the user asks to implement an attached or approved plan.

1. Do not edit the plan file unless explicitly requested.
2. Follow the plan todos in order. Mark the current todo `in_progress`, then mark it complete before moving to the next.
3. Keep implementation scoped to the plan. Do not add adjacent features, migrations, or compatibility behavior unless the plan says so or the user decides it.
4. Before editing, read the relevant files and understand existing patterns. Preserve unrelated user changes.
5. Implement or update tests according to the plan-to-test mapping. If a planned item has no test mapping, call it out before proceeding or add the smallest appropriate test.
6. For each planned behavior, update source, tests, and docs together when the plan calls for them.
7. After implementation, run targeted lint diagnostics and the planned verification commands. If a command fails, fix the cause and rerun.
8. Watch for staged vs unstaged differences. Report if tested code differs from the staged snapshot.

## Completion Response

Include:

- What changed at a high level.
- Which tests cover each planned behavior, including any unmapped items.
- Verification commands and results.
- Any remaining risks or files not staged.
