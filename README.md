# Agent Context Store Toolkit

Agent Context Store Toolkit (`acs`) is a Git-backed, schema-validated artifact handoff toolkit for AI agents.

It helps Cursor, Claude Code, OpenClaw, Codex, CI pipelines, and custom agent runtimes write durable SDLC context into a user-owned repository. The toolkit creates requirements, design docs, ADRs, API notes, test plans, handoff records, validation reports, and role-specific context packages, push to your own repository.

## Prerequisites
- Node.js `>=20`
- Git
- A project repository or folder

## Step 1: Install the CLI
```bash
npm install -g agent-context-store
acs --help
```

## Step 2: Choose a Store Mode

`acs` supports three storage modes so you can start lightweight and upgrade as your workflow grows.

| Mode | Command | Where context is stored | Best for |
|------|---------|------------------------|----------|
| **in-repo** _(default)_ | `acs init` | `.acs/` inside your project | Most projects — context stays with code |
| **local** | `acs init --mode local` | OS user-data dir (`~/.local/share/…`) | Personal workflows, no repo changes |
| **dedicated** | `acs init --mode dedicated` | This folder IS the store root | Multi-project teams, CI governance |

### In-repo (default)

```bash
cd my-project
acs init
```

Creates `.acs/` inside your project. Commit it together with your code.

### Local

```bash
cd my-project
acs init --mode local
```

Stores context in the OS user-data directory and records the project binding in a local registry. No files are written into the project repository.

### Dedicated

```bash
mkdir context-store-repo
cd context-store-repo
git init
acs init --mode dedicated
```

The entire folder becomes the context store root. Use this for multi-project or multi-team governance.

## Step 3: Configure Agents

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

### Install into a specific repository path

```bash
acs install-skills --agent all --path /path/to/repo
```

## Step 4: Create Artifacts

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

Give each agent access to the same project (in-repo mode) or context store repository (dedicated mode) and ask it to use `acs` for durable handoffs.

Suggested agent instruction:

```text
Use Agent Context Store for durable project context.
Before creating or handing off work, run acs status and acs validate.
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

## Context Store Layout

### In-repo mode (default)

```text
.acs/
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

### Dedicated mode

```text
<store-root>/
  config.yaml
  index.json
  audit/
  artifacts/
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
- `index.json`: generated artifact and handoff index.
- `audit/`: local audit log for CLI-created changes.

In **in-repo mode** all paths above are inside `.acs/`.

## Commands

| Command              | What it does                                                                                            | Example                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `acs --version`      | Prints the installed CLI version.                                                                       | `acs --version`                                              |
| `acs init`           | Initializes the context store. Default mode is `in-repo` (`.acs/`).                                    | `acs init`, `acs init --mode local`                         |
| `acs status`         | Shows current mode, store path, initialized state, and artifact/handoff counts.                         | `acs status`                                                 |
| `acs install-skills` | Installs agent-specific skill and instruction files for Cursor, Claude, Codex, or all supported agents. | `acs install-skills --agent cursor`                          |
| `acs new`            | Creates a new SDLC artifact such as requirements, design, ADR, API notes, or test plan.                 | `acs new srs --task TASK-123 --title "Feature requirements"` |
| `acs validate`       | Validates the context store structure, artifact metadata, schemas, and handoff records.                 | `acs validate`                                               |
| `acs handoff create` | Creates a role-to-role handoff record for a task.                                                       | `acs handoff create --from sa --to dev --task TASK-123`      |
| `acs handoff check`  | Validates a specific handoff before another agent relies on it.                                         | `acs handoff check HOFF-TASK-123-SA-DEV`                     |
| `acs package`        | Builds a role-specific context package for the next agent or automation step.                           | `acs package --task TASK-123 --role dev`                     |
| `acs index`          | Rebuilds `index.json` from artifacts and handoffs.                                                      | `acs index`                                                  |
| `acs doctor`         | Runs the same validation checks as `acs validate` for quick health checks.                              | `acs doctor`                                                 |

### Command Reference

```bash
acs --version
acs init [path] [--mode <in-repo|local|dedicated>]
acs status
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


## Developing This Repository

If you want to modify or test the toolkit itself, see [DEVELOPMENT.md](DEVELOPMENT.md).
