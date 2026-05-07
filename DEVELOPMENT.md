# Development Guide

This guide is for developers who want to modify or test Agent Context Store Toolkit itself.

Normal users do not need these steps. To use the published CLI, install it with npm:

```bash
npm install -g agent-context-store
acs --help
```

## Repository Setup

This repository is a pnpm workspace monorepo and uses `pnpm@10.33.0`.

```bash
corepack enable
pnpm install
pnpm build
pnpm smoke
```

## Project Layout

```text
packages/
  cli/       # acs command-line entrypoint
    agent-config/   # bundled agent skill templates (included in npm package)
      AGENTS.md
      CLAUDE.md
      skills/agent-context-store/SKILL.md  # shared skill, one copy for all agents
  core/      # policy-aware context store creation, validation, handoff, packaging logic
schemas/    # source JSON schemas; defaults are also embedded into core for published installs
templates/  # source Markdown templates; defaults are also embedded into core for published installs
examples/   # usage examples
```

The `agent-config/` directory is listed in `packages/cli/package.json` under `files` so it is included in every npm publish. The installer uses an upward path search from the compiled `dist/index.js` to locate it at runtime, which works both in the local source tree and after a global npm install.
The core package seeds `.acs/acs.yaml`, `roles/`, `artifact-types/`, `workflows/`, `schemas/`, and `templates/` during `acs init`. Default policy/schema/template text is embedded in `packages/core/dist` so initialization does not depend on source-tree assets after publish.

## Local CLI Usage

Run the local CLI directly after building:

```bash
node packages/cli/dist/index.js --help
```

When following user-facing examples from this source repository instead of a published install, replace `acs` with the local CLI path:

```bash
node ../agent-context-store/packages/cli/dist/index.js
```

## Local Demo

```bash
mkdir tmp/demo
cd tmp/demo

node ../../packages/cli/dist/index.js init
node ../../packages/cli/dist/index.js status
node ../../packages/cli/dist/index.js roles
node ../../packages/cli/dist/index.js ba new srs --task DEMO-0001 --title "Login with OTP"
node ../../packages/cli/dist/index.js role explain dev --task DEMO-0001
node ../../packages/cli/dist/index.js next --role sa --task DEMO-0001
node ../../packages/cli/dist/index.js validate --role ba --task DEMO-0001
node ../../packages/cli/dist/index.js handoff create --from ba --to sa --task DEMO-0001
node ../../packages/cli/dist/index.js handoff check HOFF-DEMO-0001-BA-SA
node ../../packages/cli/dist/index.js package --task DEMO-0001 --role sa
```

This creates artifacts under `.acs/` (in-repo mode). Pass `--mode dedicated` to init if you want to use the folder as a standalone store.

## Running Tests

The test suite uses Node's built-in `node:test` runner — no additional framework is required.

```bash
pnpm test                # build all packages, then run unit + integration specs
pnpm test:integration    # build, then run only the scenario integration tests
pnpm test:e2e            # build, npm-pack both packages, install from tarball, run smoke
pnpm test:coverage       # build, then run unit + integration with coverage report
pnpm check               # alias for pnpm test
```

Tests run against the **compiled output** in `packages/cli/dist` and `packages/core/dist`. The build step is included in every `pnpm test*` command, so you do not need to run `pnpm build` separately.

### Test Layout

```text
test/
  helpers.ts              # shared utilities: makeTempDir, runCli, exists, readText,
  |                       #   readJson, withTempProject, isolatedEnv, initStore
  core.spec.ts            # core API tests — import packages/core/dist directly
  cli.spec.ts             # CLI command tests — spawn the compiled binary per command
  install-skills.spec.ts  # install-skills command tests (agents, append/replace, alias)
  integration.spec.ts     # scenario tests — full SDLC, mode variants, role enforcement,
  |                       #   local-mode isolation, idempotency, error guards
  e2e/
    pack.spec.ts          # e2e pack smoke — pnpm pack → npm install → run installed acs
```

### Test Tiers

| Script | Scope | Speed | When to run |
|---|---|---|---|
| `pnpm test` | core API + CLI commands + scenarios | ~30 s | every PR / before commit |
| `pnpm test:integration` | scenario tests only | ~15 s | iterating on a specific feature |
| `pnpm test:e2e` | npm pack + install from tarball | ~60 s | before publish |
| `pnpm test:coverage` | unit + integration with coverage | ~35 s | optional quality check |

### Isolation Strategy

All tests use one of two isolation patterns:

- **Temp directory isolation** — `makeTempDir` creates a uniquely-named directory under `os.tmpdir()`. Each test suite's `after` hook removes it with `cleanupTempDir`.
- **Env isolation for local mode** — `isolatedEnv(dir)` returns a `process.env` copy with `APPDATA`/`HOME`/`XDG_DATA_HOME` pointing to a throw-away directory. Pass it to `runCli(..., { env: isolatedEnv(dir) })` so local-mode tests never write to the real user profile.

If a test run is interrupted, orphaned temp directories may remain in the OS temp folder. They are safe to delete manually; they follow the naming pattern `acs-*`.

## Useful Commands

```bash
pnpm install   # install workspace dependencies
pnpm build     # build all packages
pnpm test      # build then run the test suite
pnpm check     # alias for pnpm test
pnpm smoke     # verify the CLI starts
```
