---
name: system-design
description: Designs architecture, feature workflows, CLI behavior, and storage modes from source context. Use when the user asks for system design, architecture planning, feature design, workflow design, or mode/API design.
disable-model-invocation: true
---

# System Design

## Instructions

Use this skill when the user asks for architecture, feature design, workflow design, or mode/CLI behavior design.

1. Read the relevant source, docs, tests, and current behavior before proposing a design.
2. Identify the design target, expected user experience, data/storage model, command/API surface, and migration impact.
3. When designing changes in an unfamiliar or dependency-heavy area, use `/graphify` or `graphify-out/GRAPH_REPORT.md` to understand code relationships, core abstractions, and cross-module risks.
4. Treat graph output as a navigation aid. Verify important conclusions against source code and tests.
5. Surface conflicts, unsuitable ideas, and uncertain decisions before implementation. Ask the user to decide only when choices materially change the plan.
6. Prefer the simplest design that fits current project conventions. Avoid future-proof abstractions unless the existing code clearly needs them.
7. Include a plan-to-test mapping: for each planned behavior or decision, specify the unit/integration test that should prove it works, or explain why no automated test is appropriate.
8. Produce a concise plan with concrete files, behavior changes, tests, and verification steps.

## Design Output

Answer these points:

- What changes for users?
- What changes in code structure?
- What assumptions or decisions are still open?
- Which tests map to each planned behavior?
- How will success be verified?
