---
name: npm-package-publish
description: Publish npm packages safely from this pnpm workspace. Use when the user asks to push, publish, release, install, or update npm packages, especially agent-context-store, agent-context-store-core, or the acs CLI.
---

# Npm Package Publish

## Scope

Use this skill for npm package publishing, dry-runs, registry verification, and post-publish install checks for this repository.

Current packages:

- `agent-context-store-core`: core library package.
- `agent-context-store`: CLI package that installs the `acs` command.

## Safety Rules

- Never print or ask the user to paste npm tokens in chat.
- If a token appears in terminal output or chat, tell the user to revoke it immediately.
- Always run tests and dry-run publish before a real publish.
- Do not use `--no-git-checks` unless the user intentionally wants to publish from the current dirty working tree.
- Publish dependency packages before packages that depend on them.
- Remember npm versions are immutable. If a version was published, bump the version before publishing again.

## Preflight

Use an npm access token only. Ask the user to set the token in their own terminal; do not ask them to paste the token in chat:

```powershell
$env:NPM_TOKEN="<ACCESS_TOKEN>"
npm config set //registry.npmjs.org/:_authToken $env:NPM_TOKEN
```

Run from the repository root:

```powershell
npm whoami
pnpm test
```

Confirm these package names before publishing:

```powershell
pnpm --filter "agent-context-store-core" exec node -p "require('./package.json').name"
pnpm --filter "agent-context-store" exec node -p "require('./package.json').name"
```

## Dry Run

Use dry-run to inspect tarball contents and dependency names:

```powershell
pnpm --filter "agent-context-store-core" publish --dry-run --no-git-checks
pnpm --filter "agent-context-store" publish --dry-run --no-git-checks
```

Expected contents:

- `agent-context-store-core`: `dist`, `LICENSE`, `package.json`.
- `agent-context-store`: `dist`, `agent-config`, `LICENSE`, `package.json`.

## Publish

Publish core first, then CLI:

```powershell
pnpm --filter "agent-context-store-core" publish --no-git-checks
pnpm --filter "agent-context-store" publish --no-git-checks
```

The access token must allow package publishing and bypass 2FA for writes when the npm account has `auth-and-writes` enabled.

## Verify Registry

After publishing:

```powershell
npm view agent-context-store-core version
npm view agent-context-store version
```

## Verify CLI Install

Normal install:

```powershell
npm install -g agent-context-store
acs --version
acs --help
```

If Windows Volta fails with `Could not create shared environment`, bypass Volta and install into the user npm prefix:

```powershell
$voltaHome = if ($env:VOLTA_HOME) { $env:VOLTA_HOME } else { Join-Path $env:LOCALAPPDATA "Volta" }
$nodePath = volta which node
$nodeDir = Split-Path $nodePath -Parent
$nodeVersion = Split-Path $nodeDir -Leaf
$nodeExe = Join-Path $voltaHome "tools\image\node\$nodeVersion\node.exe"
$npmCli = Join-Path $voltaHome "tools\image\node\$nodeVersion\node_modules\npm\bin\npm-cli.js"

& $nodeExe $npmCli install -g agent-context-store@latest --prefix "$env:APPDATA\npm"
acs --version
```

Temporary install without global shim:

```powershell
npm exec --yes --package agent-context-store -- acs --help
```

