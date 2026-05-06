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
  core/      # context store creation, validation, handoff, packaging logic
schemas/    # JSON schemas copied into initialized context stores
templates/  # Markdown templates copied into initialized context stores
examples/   # usage examples
```

The `agent-config/` directory is listed in `packages/cli/package.json` under `files` so it is included in every npm publish. The installer uses an upward path search from the compiled `dist/index.js` to locate it at runtime, which works both in the local source tree and after a global npm install.

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
node ../../packages/cli/dist/index.js new srs --task DEMO-0001 --title "Login with OTP"
node ../../packages/cli/dist/index.js validate
node ../../packages/cli/dist/index.js handoff create --from ba --to sa --task DEMO-0001
node ../../packages/cli/dist/index.js handoff check HOFF-DEMO-0001-BA-SA
node ../../packages/cli/dist/index.js package --task DEMO-0001 --role sa
```

## Running Tests

The test suite uses Node's built-in `node:test` runner — no additional framework is required.

```bash
pnpm test      # build all packages, then run all tests
pnpm check     # alias for pnpm test
```

Tests run against the **compiled output** in `packages/cli/dist` and `packages/core/dist`. The build step is included in `pnpm test`, so you do not need to run `pnpm build` separately.

### Test Layout

```text
test/
  helpers.js              # shared utilities: makeTempDir, runCli, exists, readText …
  core.test.js            # unit tests importing from packages/core/dist
  cli.test.js             # behavioral tests spawning the compiled CLI binary
  install-skills.test.js  # install-skills command tests (agents, append/replace, alias)
```

### Isolation

Each test suite creates isolated temporary directories under the OS temp folder (`os.tmpdir()`). These directories are removed after each suite so no test output is left in the workspace.

If a test run is interrupted, orphaned temp directories may remain in the OS temp folder. They are safe to delete manually; they follow the naming pattern `acs-*`.

## Useful Commands

```bash
pnpm install   # install workspace dependencies
pnpm build     # build all packages
pnpm test      # build then run the test suite
pnpm check     # alias for pnpm test
pnpm smoke     # verify the CLI starts
```
