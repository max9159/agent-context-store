---
name: design-review
description: Reviews plans and design proposals against requirements, existing behavior, public contracts, and implementation risk. Use when the user asks to review a design, validate a plan, or find conflicts before implementation.
disable-model-invocation: true
---

# Design Review

## Instructions

Use this skill when reviewing a plan, design document, or proposed implementation approach.

1. Compare the design directly against the source plan or user-approved decisions.
2. Check for conflicts with existing public behavior, docs, CLI contracts, tests, and package boundaries.
3. Call out hidden assumptions, especially storage location, migration behavior, path semantics, and backwards compatibility.
4. Distinguish must-fix issues from acceptable tradeoffs.
5. If a decision belongs to the user, ask clearly and narrowly.
6. Include verification gaps only when they affect confidence.

## Review Format

Lead with findings, ordered by severity:

- Findings first.
- Open questions or assumptions second.
- Brief verdict last: whether the design fulfills the plan and what remains before implementation.
