# Agent Context Store Toolkit

Agent Context Store Toolkit (`acs`) is a Git-backed, schema-validated artifact handoff toolkit for AI agents.

It helps Cursor, Claude Code, OpenClaw, Codex, CI pipelines, and custom agent runtimes write durable SDLC context into a user-owned repository. The toolkit creates requirements, design docs, ADRs, API notes, test plans, handoff records, validation reports, and role-specific context packages, push to your own repository.

## Prerequisites
- Node.js `>=20`
- Git
- A Git repository or folder to use as the context store

## Install
```bash
npm install -g @agent-context-store/cli
acs --help
```
<!-- 
The npm install command is the same for every agent runtime. Cursor, Claude Code, OpenClaw, Codex, and CI only need `acs` to be available in the shell where they run.

If you do not want a global install, use `npx`:

```bash
npx @agent-context-store/cli --help
npx @agent-context-store/cli init
``` -->

## Configure Agents

### Option 1: Install into the user's folder
Giving each agent the right instruction or skill file so it knows when to call `acs`.
Run `acs install-skills` with the `--agent` flag for your agent.

```bash
acs install-skills --agent cursor
acs install-skills --agent claude
acs install-skills --agent codex
acs install-skills --agent all
```

| Agent      | Files installed                                            |
| ---------- | ---------------------------------------------------------- |
| `cursor`   | `AGENTS.md`, `.cursor/skills/agent-context-store/SKILL.md` |
| `claude`   | `CLAUDE.md`, `.claude/skills/agent-context-store/SKILL.md` |
| `codex`    | `AGENTS.md`, `.agent/skills/agent-context-store/SKILL.md`  |
| `openclaw` | _(not yet available — warning only)_                       |
| `all`      | All of the above except openclaw                           |

Skill files are always replaced with the bundled version. 
If `AGENTS.md` or `CLAUDE.md` already exists, the installer appends the starter instructions to the end of the existing file.

### Option 2: Install into a specific repository path

```bash
acs install-skills --agent all --path /path/to/repo
```

## Commands

This repository currently provides a CLI-first. (MCP Server support is planned for a later phase.)

| Command              | What it does                                                                                            | Example                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `acs --version`      | Prints the installed CLI version.                                                                       | `acs --version`                                              |
| `acs init`           | Initializes the context store layout, schemas, templates, and audit files.                              | `acs init`                                                   |
| `acs install-skills` | Installs agent-specific skill and instruction files for Cursor, Claude, Codex, or all supported agents. | `acs install-skills --agent cursor`                          |
| `acs new`            | Creates a new SDLC artifact such as requirements, design, ADR, API notes, or test plan.                 | `acs new srs --task TASK-123 --title "Feature requirements"` |
| `acs validate`       | Validates the context store structure, artifact metadata, schemas, and handoff records.                 | `acs validate`                                               |
| `acs handoff create` | Creates a role-to-role handoff record for a task.                                                       | `acs handoff create --from sa --to dev --task TASK-123`      |
| `acs handoff check`  | Validates a specific handoff before another agent relies on it.                                         | `acs handoff check HOFF-TASK-123-SA-DEV`                     |
| `acs package`        | Builds a role-specific context package for the next agent or automation step.                           | `acs package --task TASK-123 --role dev`                     |
| `acs index`          | Rebuilds `.context-store/index.json` from artifacts and handoffs.                                       | `acs index`                                                  |
| `acs doctor`         | Runs the same validation checks as `acs validate` for quick health checks.                              | `acs doctor`                                                 |


## Context Store Repository

Create a dedicated context store repository for your team.

Use a dedicated store repository when:

- Multiple agents or developers need to share handoff context.
- The work spans multiple source repositories.
- You want reviewable history for requirements, design decisions, and agent handoffs.
- You want CI to validate context artifacts independently from application code.

Run `acs init` at the dedicated store repository root and commit the generated `artifacts/`, `handoffs/`, `packages/`, `schemas/`, `templates/`, `docs/`, and `.context-store/` files.

## Quickstart

Create and initialize a context store:

```bash
mkdir context-store-demo
cd context-store-demo
git init
acs init
```

Create SDLC artifacts for a task:

```bash
acs new srs --task DEMO-0001 --title "Login with OTP"
acs new sdd --task DEMO-0001 --title "Login with OTP System Design"
acs new adr --task DEMO-0001 --title "Use Redis for OTP State"
acs new api --task DEMO-0001 --title "OTP Login API"
acs new test --task DEMO-0001 --title "OTP Login Test Plan"
```

Validate, create handoffs, and package context for the next role:

```bash
acs validate
acs handoff create --from ba --to sa --task DEMO-0001
acs handoff check HOFF-DEMO-0001-BA-SA
acs package --task DEMO-0001 --role sa
acs index
```

## How Agents Should Use It

Give each agent access to the same context store repository and ask it to use `acs` for durable handoffs.

Suggested agent instruction:

```text
Use Agent Context Store for durable project context.
Before creating or handing off work, run acs validate.
Create task artifacts with acs new.
Create role handoffs with acs handoff create.
Generate the next role package with acs package.
Commit context store changes to the configured Git repository.
```

Typical role flow:

```bash
acs new srs --task TASK-123 --title "Feature requirement"
acs handoff create --from ba --to sa --task TASK-123
acs package --task TASK-123 --role sa

acs new sdd --task TASK-123 --title "Feature system design"
acs handoff create --from sa --to dev --task TASK-123
acs package --task TASK-123 --role dev

acs new test --task TASK-123 --title "Feature test plan"
acs handoff create --from dev --to qa --task TASK-123
acs package --task TASK-123 --role qa
```

## Command Reference

```bash
acs --version
acs init [path]
acs install-skills --agent <cursor|claude|codex|openclaw|all> [--path <path>]
acs new <srs|sdd|adr|api|test> --task <TASK_ID> [--title <TITLE>]
acs validate
acs handoff create --from <ROLE> --to <ROLE> --task <TASK_ID>
acs handoff check <HANDOFF_ID_OR_PATH>
acs package --task <TASK_ID> --role <ROLE> [--format markdown|json]
acs index
acs doctor
```

Common roles:

- `ba`
- `sa`
- `dev`
- `developer`
- `qa`
- `reviewer`

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

Important outputs:

- `artifacts/`: durable SDLC artifacts such as requirements, designs, ADRs, API notes, and test plans.
- `handoffs/`: explicit role-to-role handoff records.
- `packages/`: role-specific context bundles for the next agent.
- `.context-store/index.json`: generated artifact and handoff index.
- `.context-store/audit/`: local audit log for CLI-created changes.

## Design Boundary

Agent Context Store Toolkit makes handoffs explicit:

- durable artifacts
- metadata
- source references
- approval state
- readiness checks
- role-specific context packages

The actual documents stay in the user's chosen context repository.

## Developing This Repository

If you want to modify or test the toolkit itself, see [DEVELOPMENT.md](DEVELOPMENT.md).
