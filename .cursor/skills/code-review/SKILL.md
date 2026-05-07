---
name: code-review
description: Reviews staged code changes for correctness, regressions, plan fulfillment, test coverage, and unexpected side effects. Use when the user asks for code review, staged-change review, PR review, or implementation verification.
disable-model-invocation: true
---

# Code Review

## Instructions

Use this skill when the user asks to review code, staged changes, or whether an implementation fulfills a plan.

1. Review the staged diff, not just the working tree. If files are `MM`, mention that staged and unstaged content may differ.
2. Lead with findings ordered by severity.
3. Focus on bugs, regressions, missing tests, unexpected side effects, and plan mismatches.
4. Verify claims against code paths, tests, and command output when possible. Reproduce suspicious behavior with a narrow command.
5. Check that existing user-facing contracts still work, especially CLI examples, returned paths, config formats, and documented commands.
6. Treat tests that mutate real user state as a risk unless they isolate paths through temp dirs or explicit test env vars.
7. If there are no findings, say so clearly and mention residual risk.

## Review Response

Include:

- Findings with file references.
- Plan fulfillment verdict.
- Verification performed.
- Scope notes for untracked or unstaged files.
