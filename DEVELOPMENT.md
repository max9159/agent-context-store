# Development Guide

This guide is for developers who want to modify or test Agent Context Store Toolkit itself.

Normal users do not need these steps. To use the published CLI, install it with npm:

```bash
npm install -g @agent-context-store/cli
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
  core/      # context store creation, validation, handoff, packaging logic
schemas/    # JSON schemas copied into initialized context stores
templates/  # Markdown templates copied into initialized context stores
examples/   # usage examples
```

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

## Useful Commands

```bash
pnpm install   # install workspace dependencies
pnpm build     # build all packages
pnpm check     # run the repository check script
pnpm smoke     # verify the CLI starts
```
