# Agent Context Store Toolkit

Agent Context Store Toolkit is a Git-backed, schema-validated artifact handoff toolkit for AI agents.

It defines, creates, validates, and packages context repository artifacts for Cursor, Claude Code, OpenClaw, CI pipelines, and custom agent runtimes.

It is not hosted storage, an orchestrator, a vector database, agent memory, or an issue tracker. It writes to user-owned context repositories such as a local workspace, GitLab repo, GitHub repo, or internal Git repo.

## Phase 1 Status

This repository currently provides a CLI-first Phase 1 implementation:

- `acs init`
- `acs new`
- `acs validate`
- `acs handoff create`
- `acs handoff check`
- `acs package`
- `acs index`
- `acs doctor`

MCP Server support is planned for a later phase.

## Quickstart

```bash
pnpm install
pnpm build

mkdir tmp/demo
cd tmp/demo

node ../../packages/cli/dist/index.js init
node ../../packages/cli/dist/index.js new srs --task DEMO-0001 --title "Login with OTP"
node ../../packages/cli/dist/index.js validate
node ../../packages/cli/dist/index.js handoff create --from ba --to sa --task DEMO-0001
node ../../packages/cli/dist/index.js handoff check HOFF-DEMO-0001-BA-SA
node ../../packages/cli/dist/index.js package --task DEMO-0001 --role sa
```

When published, the intended CLI entrypoint is:

```bash
acs init
acs new srs --task DEMO-0001 --title "Login with OTP"
acs validate
acs handoff create --from ba --to sa --task DEMO-0001
acs package --task DEMO-0001 --role sa
```

## Generated Context Store Layout

```text
.context-store/
  config.yaml
  index.json
  audit/
artifacts/
  requirements/
  design/
  adr/
  api/
  test/
handoffs/
summaries/
packages/
schemas/
templates/
docs/
```

## Development

```bash
pnpm install
pnpm build
pnpm smoke
```

## Design Boundary

Agent Context Store Toolkit does not keep private agent memory or hidden session state. Its job is to make handoffs explicit:

- durable artifacts
- metadata
- source references
- approval state
- readiness checks
- role-specific context packages

The actual documents stay in the user's chosen context repository.
