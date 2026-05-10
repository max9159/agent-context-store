# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
corepack enable          # enable pnpm (first time only)
pnpm install             # install workspace dependencies
pnpm build               # compile all packages (cli + core)
pnpm test                # build then run unit + integration tests (~30 s)
pnpm test:integration    # build then run scenario tests only (~15 s)
pnpm test:e2e            # build, npm-pack, install from tarball, run smoke (~60 s)
pnpm test:coverage       # build then run tests with coverage report
pnpm smoke               # verify the CLI binary starts
```

Run the local CLI directly after building:

```bash
node src/packages/cli/dist/index.js --help
```

## Architecture

This is a **pnpm workspace monorepo** with two published packages and a shared test suite.

### Packages

- **`src/packages/core/`** (`agent-context-store-core`) — all business logic: store resolution, policy loading, artifact creation, validation, handoff management, context packaging. Single file: `src/index.ts`. Exports a typed public API consumed by the CLI.

- **`src/packages/cli/`** (`agent-context-store`) — thin CLI wrapper (`src/index.ts`) that parses `process.argv`, calls core functions, and prints results. Also owns the `agent-config/` directory (bundled agent skill templates for Cursor, Codex, Codex).

- **`src/assets/`** — source JSON schemas and Markdown templates. These are the canonical source of truth, but most are also **embedded inline** in `core/src/index.ts` (`defaultSchemaText`, `defaultTemplateText`) so the published package has no runtime dependency on source files.

### Key design patterns

**Store mode resolution** (`resolveStoreContext` in core): The core detects which store mode is active by looking for `.acs/config.yaml` (in-repo), `config.yaml` with `mode: dedicated` (dedicated), or a local registry entry (`~/Library/Application Support/agent-context-store/projects.json` on macOS). Every public function receives a `rootDir` and calls this first.

**Policy loading**: `loadPolicy` starts from the compiled-in `defaultPolicy` object (which contains all default roles, artifact types, workflow stages, and handoff rules), then overlays files from `.acs/roles/`, `.acs/artifact-types/`, `.acs/workflows/`. If those directories are empty or missing, defaults apply — so the store works immediately after `acs init`.

**Agent skill installation**: `acs install-skills --agent <name>` copies files from `src/packages/cli/agent-config/` into the target repo. The installer finds that directory by walking up from `dist/index.js` up to 8 levels — this works both in the local source tree and after a global npm install.

**Asset fallback chain**: When creating artifacts or loading schemas, core first checks the store's `templates/` and `schemas/` directories, then falls back to `defaultTemplateText`/`defaultSchemaText` (embedded strings), then to `src/assets/` via `readAssetText` (source-tree only, used during development).

### Test suite

Tests use Node's built-in `node:test` runner — no test framework. All tests run against **compiled `dist/` output**, so `pnpm build` is always run first. Two isolation patterns are used:
- `makeTempDir` / `cleanupTempDir` — temp dirs under `os.tmpdir()` with prefix `acs-*`
- `isolatedEnv(dir)` — overrides `HOME`/`APPDATA`/`XDG_DATA_HOME` for local-mode tests to avoid touching the real user profile

To run a single spec file:
```bash
pnpm build && node --experimental-strip-types --test src/test/cli.spec.ts
```

### Workflow entry mode

The default workflow is BA → SA → DEV → QA, but **any role can be the entry
point**. Pass `--mode relaxed` to `acs validate`, `acs next`, `acs handoff
create`, and `acs handoff check` when starting at SA/DEV/QA without prior
upstream artifacts. Missing upstream inputs become warnings + AI hints rather
than errors. Default is `--mode strict`. The synthetic entry handoff is
recorded with `acs handoff create --from system --to <role> --task <id>
--mode relaxed`.

Per-task working logs live at `audit/tasks/{TASK_ID}.jsonl` (JSONL, atomic
appends). Read them with `acs log --task <id>`.

### Cursor skill routing

The `.cursor/rules/workflow-routing.mdc` rule routes to explicit skills in `.cursor/skills/`:
- **`system-design`** — for architecture, feature design, mode/API design
- **`design-review`** — for reviewing a plan before implementation
- **`develop-by-plan`** — for implementing an approved plan
- **`code-review`** — for reviewing staged changes or plan fulfillment
