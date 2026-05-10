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
src/
  packages/
    cli/       # acs command-line entrypoint
      agent-config/   # bundled agent skill templates (included in npm package)
        AGENTS.md
        CLAUDE.md
        skills/agent-context-store/SKILL.md  # shared skill, one copy for all agents
    core/      # policy-aware context store creation, validation, handoff, packaging logic
  assets/
    schemas/   # source JSON schemas; defaults are also embedded into core for published installs
    templates/ # source Markdown templates; defaults are also embedded into core for published installs
  test/        # test sources and helpers
examples/   # usage examples
```

The `agent-config/` directory is listed in `src/packages/cli/package.json` under `files` so it is included in every npm publish. The installer uses an upward path search from the compiled `dist/index.js` to locate it at runtime, which works both in the local source tree and after a global npm install.
The core package seeds `.acs/acs.yaml`, `roles/`, `artifact-types/`, `workflows/`, `schemas/`, and `templates/` during `acs init`. Default policy/schema/template text is embedded in `src/packages/core/dist` so initialization does not depend on source-tree assets after publish.

## Local CLI Usage

Run the local CLI directly after building:

```bash
node src/packages/cli/dist/index.js --help
```

When following user-facing examples from this source repository instead of a published install, replace `acs` with the local CLI path:

```bash
node ../agent-context-store/src/packages/cli/dist/index.js
```

## Local Demo

```bash
mkdir tmp/demo
cd tmp/demo

node ../../src/packages/cli/dist/index.js init
node ../../src/packages/cli/dist/index.js status
node ../../src/packages/cli/dist/index.js roles
node ../../src/packages/cli/dist/index.js ba new srs --task DEMO-0001 --title "Login with OTP"
node ../../src/packages/cli/dist/index.js role explain dev --task DEMO-0001
node ../../src/packages/cli/dist/index.js next --role sa --task DEMO-0001
node ../../src/packages/cli/dist/index.js validate --role ba --task DEMO-0001
node ../../src/packages/cli/dist/index.js handoff create --from ba --to sa --task DEMO-0001
node ../../src/packages/cli/dist/index.js handoff check HOFF-DEMO-0001-BA-SA
node ../../src/packages/cli/dist/index.js package --task DEMO-0001 --role sa
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

Tests run against the **compiled output** in `src/packages/cli/dist` and `src/packages/core/dist`. The build step is included in every `pnpm test*` command, so you do not need to run `pnpm build` separately.

### Test Layout

```text
src/test/
  helpers.ts              # shared utilities: makeTempDir, runCli, exists, readText,
  |                       #   readJson, withTempProject, isolatedEnv, initStore
  core.spec.ts            # core API tests — import src/packages/core/dist directly
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

## Releasing

Releases are driven by `.github/workflows/release.yml` (manual `workflow_dispatch`).
The workflow bumps `package.json` versions in all three packages, builds, runs
the test suite, publishes both `agent-context-store-core` and
`agent-context-store` to npm, then commits + tags + pushes.

Pick a release type when you trigger the workflow:

| Type    | Example bump                | npm dist-tag | Pushes to `main`?      |
|---------|-----------------------------|--------------|------------------------|
| `patch` | `0.2.10` → `0.2.11`         | `latest`     | yes (commit + tag)     |
| `minor` | `0.2.10` → `0.3.0`          | `latest`     | yes (commit + tag)     |
| `major` | `0.2.10` → `1.0.0`          | `latest`     | yes (commit + tag)     |
| `beta`  | `0.2.10` → `0.2.11-beta.0`  | `beta`       | tag only, no `main` commit |

Beta releases never claim the `latest` dist-tag, so users on `npm i agent-context-store`
keep getting the stable line. They have to opt in with `npm i agent-context-store@beta`.

### Trigger a release

**GitHub UI**

1. Open **Actions → Release** and click **Run workflow**.
2. Pick the branch (usually `main`).
3. Pick **Release type**: `patch` / `minor` / `major` / `beta`.
4. **Run workflow**.

**GitHub CLI**

```bash
gh workflow run release.yml -f release_type=patch     # default; cuts a stable patch
gh workflow run release.yml -f release_type=minor
gh workflow run release.yml -f release_type=major
gh workflow run release.yml -f release_type=beta      # publishes under @beta
```

### Beta train semantics

Repeated `beta` runs increment the prerelease counter:

```
0.2.11-beta.0 → 0.2.11-beta.1 → 0.2.11-beta.2 ...
```

Run with `release_type=patch` to **graduate** a beta — the workflow drops the
`-beta.N` suffix without bumping the patch (e.g. `0.2.11-beta.3` → `0.2.11`)
and publishes it as `latest`.

### Verify after a release

```bash
npm dist-tag ls agent-context-store
# latest: 0.2.11
# beta:   0.2.12-beta.0
npm view agent-context-store version
npm view agent-context-store-core version
```

If `latest` ever shows a beta version, the workflow published without `--tag beta` —
check the **Publish core / Publish cli** step logs for the `--tag` argument.

### Required secrets

- `NPM_TOKEN` — npm publish token with write access to both packages.
- `GITHUB_TOKEN` is provided automatically; the workflow uses it to push the
  commit + tag back to `main`.

### Consumer install commands

```bash
# Stable users — unchanged
npm i agent-context-store
pnpm add agent-context-store

# Beta testers
npm i agent-context-store@beta
pnpm add agent-context-store@beta

# Pin to an exact prerelease
npm i agent-context-store@0.2.11-beta.0
```
