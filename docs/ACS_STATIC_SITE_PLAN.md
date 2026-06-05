# ACS Static Site and Workflow Dashboard Plan

## Requirement

Add a built-in visualization layer for Agent Context Store (ACS) so users can inspect generated project context without changing the existing artifact, handoff, package, or audit file layout.

The feature should provide:

- Static HTML output for browsing ACS artifacts.
- A task-centered workflow dashboard for BA -> SA -> DEV -> QA progress.
- Kanban-style task status tracking derived from existing ACS state.
- Handoff, package, validation, and audit visibility.
- Zero-dependency simplified Markdown rendering.
- No Claude Code hooks in the first implementation.

## Current System

ACS already has several data sources that can support a static dashboard:

- `index.json` contains generated artifact and handoff indexes.
- `artifacts/{task_id}/{type}/{artifact_id}.md` contains task-first artifact documents with frontmatter.
- `handoffs/{task_id}/...yaml` records role-to-role handoff contracts.
- `packages/{task_id}/{role}.context.md` records role-scoped context packages.
- `audit/tasks/{TASK_ID}.jsonl` records per-task event timelines.
- `validate`, `next`, and `status` already derive workflow state from existing policy and artifact metadata.

The demo repository commit `00eb57e5046eb9eb16061c28d191543e1899e4d5` shows a minimal MkDocs-based artifact browser. That approach is useful as a reference, but the built-in ACS feature should not depend on Python or MkDocs and should expose ACS-specific workflow state rather than only rendering Markdown files.

## Existing Code to Reuse

- `buildIndex()` in `src/packages/core/src/index.ts` for rebuilding artifact and handoff indexes.
- `validateContextStore()` and `validatePolicyScope()` for valid, warning, and blocked state derivation.
- `getTasksOverview()` for task grouping and suggested next role.
- `readTaskLog()` for task timeline events.
- `getNextActions()` for role-specific missing inputs and suggested outputs.
- CLI command routing in `src/packages/cli/src/index.ts`.
- Existing compiled-output test pattern under `src/test/`.

## Affected Features and Modules

This plan affects the following ACS features and modules:

| Area | Files / modules | Impact |
| --- | --- | --- |
| Core public API | `src/packages/core/src/index.ts` | Add site model types and a `buildSiteModel()` API that aggregates existing store state for static-site generation. |
| Store resolution | `resolveStoreContext()` in `src/packages/core/src/index.ts` | Reuse existing in-repo, local, and dedicated store resolution so `site/` is written under the resolved store root. No behavior change expected. |
| Artifact discovery | `findArtifactsForTask()`, `validateContextStore()`, artifact frontmatter parsing in `src/packages/core/src/index.ts` | Reuse current artifact scanning and metadata parsing. The site model must continue to treat frontmatter `task_id` as the source of truth. |
| Handoff discovery | `listHandoffs()`, `checkHandoff()`, handoff validation helpers in `src/packages/core/src/index.ts` | Reuse existing handoff records for task detail, handoff chain, and blocked-state derivation. |
| Workflow guidance | `getTasksOverview()`, `getNextActions()`, policy loading in `src/packages/core/src/index.ts` | Reuse current workflow policy and next-action logic for dashboard and task detail state. |
| Validation | `validateContextStore()` and `validatePolicyScope()` in `src/packages/core/src/index.ts` | Surface validation errors, warnings, and hints in the generated site model. |
| Audit timeline | `readTaskLog()` and `audit/tasks/{TASK_ID}.jsonl` | Read per-task JSONL audit logs for timeline display. No audit format change expected. |
| CLI command surface | `src/packages/cli/src/index.ts` | Add `acs site build`, parse supported flags, call core site model API, and write static site files. |
| CLI help text | `printHelp()` / command reference in `src/packages/cli/src/index.ts` | Add `acs site build` usage examples and command summary. |
| Static site template | New CLI-owned template files or inline template in `src/packages/cli/` | Add zero-dependency HTML, CSS, and JavaScript assets for the static viewer. |
| Generated store output | `site/` under the resolved ACS store root | Add disposable derived output. This directory must not become an input to artifact indexing or validation. |
| Tests | `src/test/core.spec.ts`, `src/test/cli.spec.ts`, possibly `src/test/integration.spec.ts` | Add coverage for site model aggregation, Kanban derivation, generated output files, and unchanged existing behavior. |
| Documentation | `README.md`, `src/packages/cli/README.md`, `docs/ACS_STATIC_SITE_PLAN.md` | Document the new command, output location, and non-goals. |

The following areas should not be changed by this plan:

- Artifact file layout under `artifacts/{task_id}/{type}/{artifact_id}.md`.
- Handoff file layout under `handoffs/`.
- Package file layout under `packages/`.
- Existing artifact schemas, role schemas, workflow schemas, and templates.
- Existing `acs init`, `acs new`, `acs validate`, `acs handoff`, `acs package`, and `acs index` behavior.
- Agent skill installation behavior for Cursor, Claude Code, Codex, and OpenClaw.
- Claude Code hooks.

## Planned Implemented Features

The first implementation should deliver the following concrete features:

| Feature | User-facing behavior | Implementation scope | Primary data source | Test coverage |
| --- | --- | --- | --- | --- |
| Static site build command | User runs `acs site build` and gets a generated static site under the ACS store `site/` directory. | Add CLI command parsing, core model call, and site file writing. | Resolved ACS store root from `resolveStoreContext()`. | CLI test verifies `site/index.html`, `site/assets/site.css`, `site/assets/site.js`, and `site/data/model.json` are created. |
| Single-task site build | User runs `acs site build --task TASK-123` to generate a site model focused on one task. | Add optional task filter to CLI and site model generation. | Artifact frontmatter `task_id`, matching handoffs, matching audit log. | CLI/core tests verify unrelated tasks are excluded from `model.json`. |
| Dashboard summary | Site landing view shows total tasks, artifacts, handoffs, validation state, and latest activity. | Static HTML/JS renders summary cards from `model.json`. | Site model, validation result, audit timeline. | Core test verifies model summary fields; CLI snapshot-style assertions verify generated model shape. |
| Kanban task board | Site shows tasks grouped into `Entry`, `BA`, `SA`, `DEV`, `QA`, `Blocked`, and `Done`. Tasks with a pending handoff approval remain in their role column and show a per-card "⏳ Pending &lt;ROLE&gt;" badge. | Add derived Kanban state logic in core; render columns in static JS. | Workflow stages, artifact owners, handoff status, validation result. | Core tests cover representative state derivation, including blocked precedence. |
| Task detail view | User can select a task and see its artifacts, handoffs, timeline, validation messages, and suggested next role/actions. | Static JS view backed by task entries in `model.json`. | `getTasksOverview()`, `getNextActions()`, `readTaskLog()`, validation result. | Core test verifies task model includes artifacts, handoffs, timeline, and next actions. |
| Artifact browser | Site lists artifacts with filters by task, type, owner, status, and approval status. | Static JS filtering over artifact records; links to rendered artifact detail. | `validateContextStore().artifacts` and artifact frontmatter. | Core test verifies artifact metadata is present; manual check verifies filters work. |
| Artifact detail rendering | User can read artifact Markdown content inside the static site. | Add zero-dependency simplified Markdown renderer and safe HTML escaping. | Artifact Markdown files. | Unit tests verify headings, lists, code blocks, links, and HTML escaping. |
| Handoff view | Site shows handoff records grouped by task with from-role, to-role, status, approval status, and source path. | Add handoff extraction to site model; render table/detail in static JS. | `handoffs/` YAML files and validation handoff list. | Core test verifies handoff metadata extraction tolerates missing optional fields. |
| Validation view | Site shows ACS validation errors, warnings, and AI hints. | Include validation result in `model.json`; render grouped messages in static JS. | `validateContextStore()` / policy scope validation. | Core test verifies invalid artifact/store state appears in model. |
| Audit timeline view | Site shows per-task event timeline such as artifact creation, handoff creation, package build, and index rebuild. | Read JSONL task logs and render chronological events. | `audit/tasks/{TASK_ID}.jsonl`. | Core test verifies timeline events are parsed and sorted or preserved in append order. |
| Generated model file | Site writes `site/data/model.json` so the static UI has a stable data contract. | Serialize site model as JSON. | Aggregated core site model. | CLI test parses JSON and checks required top-level keys. |
| Zero-dependency static assets | Site works by opening `site/index.html` without installing MkDocs, Python, or frontend dependencies. | Emit plain HTML, CSS, and JS from CLI-owned template code. | Generated files only. | CLI test confirms no external package is required; manual browser check verifies local open. |
| Safe generated output boundary | Generated `site/` does not affect artifact discovery, validation, handoff checks, or index rebuilds. | Ensure existing scanners ignore `site/` naturally by only scanning known directories. | Existing ACS directories. | Regression tests run `acs index` and `acs validate` after site generation. |
| Documentation update | README documents `acs site build`, output location, and static-site limitations. | Update root and CLI README references. | N/A | `git diff --check`; existing README sync process if applicable. |

## Proposed Implementation

Add a first-class static site generator:

```bash
acs site build
acs site build --task DEMO-0001
```

By default, output should be written inside the resolved ACS store root:

```text
site/
  index.html
  assets/
    site.css
    site.js
  data/
    model.json
```

For in-repo mode this means `.acs/site/`. For dedicated mode this means `site/` at the dedicated store root.

The generator should not edit `artifacts/`, `handoffs/`, `packages/`, or `audit/`. The `site/` directory is disposable derived output and can be rebuilt at any time.

## Site Model

Add a core API that creates a static-site model from existing ACS files:

```ts
export interface SiteModel {
  generatedAt: string;
  store: StoreInfo;
  validation: ValidationResult;
  tasks: SiteTask[];
  artifacts: ArtifactRecord[];
  handoffs: SiteHandoff[];
}
```

Each task should include:

- `taskId`
- `rolesWithArtifacts`
- `artifactCount`
- `handoffCount`
- `suggestedNextRole`
- `kanbanState`
- `validationState`
- `artifacts`
- `handoffs`
- `timeline`
- `nextActionsByRole`

The model should use frontmatter `task_id` as the source of truth for artifact ownership. It must not infer task ownership from directory names alone.

## Kanban State Tracking

Kanban state should be derived from existing ACS data rather than stored separately.

Recommended states:

- `Entry`: no task artifacts yet, or relaxed entry has been started.
- `BA`: BA-owned artifacts exist and downstream role has not yet taken over.
- `SA`: SA-owned artifacts exist and DEV/QA has not yet taken over.
- `DEV`: DEV-owned artifacts exist and QA has not yet completed validation.
- `QA`: QA-owned artifacts exist but final signoff is not approved.
- `Blocked`: validation errors, missing required handoff inputs, or changes requested.
- `Done`: approved QA signoff or approved release readiness report.

Blocked state should take precedence over role-stage state. Done should take precedence only when validation is still valid.

Handoff approval status is not a separate column. A task awaiting handoff approval stays in its role column (the column of the role that owns its artifacts) and surfaces a per-card "Pending &lt;ROLE&gt;" badge. The `SiteTask.reviewStatus` field is `"pending"` when a handoff awaits approval, and `SiteTask.pendingToRole` identifies the target role.

## Static Site Pages

The first implementation can be a single static HTML app backed by `data/model.json`.

Required views:

- Dashboard: artifact count, handoff count, validation status, task count, recent activity.
- Kanban: task cards grouped by derived state.
- Task detail: artifacts, handoff chain, validation messages, timeline, suggested next actions.
- Artifact browser: filter by task, type, owner, status, and approval status.
- Handoff view: from-role, to-role, task, status, approval state, and file link.
- Validation view: errors, warnings, and AI hints.

Optional later views:

- Traceability graph from `depends_on`, `outputs`, and `source_refs`.
- Package viewer for role-specific context bundles.
- Diff links to Git history when available.

## Markdown Rendering

Use a zero-dependency simplified Markdown renderer in the static site generator.

The renderer should support only the subset needed for ACS artifacts:

- Headings
- Paragraphs
- Unordered and ordered lists
- Fenced code blocks
- Inline code
- Tables, if practical without a large parser
- Links

Security rule: escape HTML by default. Do not execute raw HTML or script content from artifact Markdown.

If the simplified renderer cannot safely support a Markdown construct, it should degrade to escaped text rather than attempting incomplete HTML parsing.

## Expected File Changes

Required:

- `src/packages/core/src/index.ts`
  - Add site model types.
  - Add `buildSiteModel()`.
  - Add helper logic for derived Kanban and validation states.

- `src/packages/cli/src/index.ts`
  - Add `acs site build`.
  - Write `site/index.html`, `site/assets/site.css`, `site/assets/site.js`, and `site/data/model.json`.
  - Print generated file paths.

- `src/test/core.spec.ts`
  - Test site model aggregation.
  - Test Kanban derivation.
  - Test validation state handling.

- `src/test/cli.spec.ts`
  - Test `acs site build` creates expected output files.
  - Test task filtering if `--task` is implemented.

- `README.md`
  - Add user-facing command documentation.

- `src/packages/cli/README.md`
  - Keep package README command reference aligned if needed by the existing sync flow.

Optional:

- `src/packages/cli/site-template/`
  - Store static template assets if keeping HTML/CSS/JS outside command code is cleaner.

## Public API / CLI Impact

New CLI command:

```bash
acs site build [--task <TASK_ID>]
```

Potential future flags:

```bash
acs site build --out <path>
acs site build --base-path <path>
```

The first implementation should keep output fixed to the ACS store root `site/` unless there is a clear need for configurable output. This keeps behavior predictable and matches the chosen decision.

## Migration Impact

No migration is required.

The feature only adds derived files under `site/` in the resolved store root. Existing ACS stores remain valid. Existing artifacts, handoffs, packages, audit logs, schemas, roles, and workflow files are unchanged.

## Edge Cases and Risks

- Markdown may contain raw HTML. Escape it rather than rendering it.
- Artifact frontmatter may be invalid. Show validation errors in the site model and dashboard.
- Some handoff schemas are currently permissive. The handoff view should tolerate missing optional fields.
- A task directory name may not match artifact frontmatter `task_id`. Use frontmatter as source of truth.
- Dedicated and in-repo modes resolve different physical store roots. Always write under the resolved `storeDir`.
- `site/` is generated output. It should not become an input source for validation, indexing, or artifact discovery.
- Large stores may produce a large `model.json`. The first version can be static and simple; pagination/search can be added later.

## Test Plan

Core tests:

- `buildSiteModel()` returns artifacts, handoffs, validation, and tasks for an initialized store.
- Task grouping uses artifact frontmatter `task_id`.
- Derived Kanban state marks invalid tasks as `Blocked`.
- Derived Kanban state marks completed QA/release artifacts as `Done` only when validation is valid.
- Task timeline includes `audit/tasks/{TASK_ID}.jsonl` events.

CLI tests:

- `acs site build` creates `site/index.html`.
- `acs site build` creates `site/data/model.json`.
- `acs site build --task TASK-123` limits model output to that task if the flag is included in the first implementation.
- Command output reports generated paths.
- Existing `acs index`, `acs validate`, and `acs status` behavior is unchanged.

Manual checks:

- Open generated `site/index.html` from an in-repo store.
- Open generated `site/index.html` from a dedicated store.
- Verify artifact content renders as escaped/safe HTML.
- Verify task Kanban state matches CLI `acs status`, `acs next`, and `acs validate` output.

## Verification Commands

```bash
pnpm build
pnpm test
pnpm test:integration
pnpm smoke
git diff --check
```

## Non-Goals

The first implementation will not include:

- Claude Code hooks.
- A long-running web server.
- Authentication or permissions.
- Database storage.
- Real-time updates.
- External Markdown, MkDocs, Python, or browser framework dependencies.
- Mutation of artifacts, handoffs, packages, or audit files from the site.

## Future Follow-Ups

- `acs site serve` for local preview.
- Claude Code hook installer that can run `acs validate`, `acs index`, and `acs site build` after relevant events.
- Traceability graph view.
- Search index.
- Git history integration.
- CI artifact upload example for publishing `site/`.
