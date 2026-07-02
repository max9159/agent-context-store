# ACS Hybrid Site — Code Review Report (PR #2)

Status: Reviewed
Date: 2026-06-25
Target: GitHub PR #2 — `feat(site): hybrid acs site — kanban serve + mkdocs docs engines`
Branch: `feature/acs-static-site-plan` → `main`
Method: medium-effort multi-angle finder sweep (8 angles) + source-grounded verification.

## Overview

This PR turns `acs site` into a hybrid local preview:

- a zero-dependency Node HTTP server for the Kanban SPA (with SSE live-reload + `fs.watch`),
- a new `docs.ts` MkDocs child-process engine, and
- a both-engines mode running both concurrently.

The earlier `design-review` (verdict GO) and `code-review` (which fixed the blocking
`EADDRINUSE` hang, B1) already hardened the core paths. This review confirms those
fixes hold and looks for what remains. Result: **no blocking issues; two low-severity
hardening items.**

## Findings (2, both low severity)

### 1. docs `--port` accepts `0`, but the engine cannot use it

- **File:** `src/packages/cli/src/docs.ts:325` (validation) / `:93` (JSDoc) / `:313` (call site)
- **Severity:** Low (certain / in-code contradiction)

`parsePortValue` permits `0` (lower bound is `n < 0`), yet the function's own JSDoc
states *"--port <N> … Does NOT support 0"* — mkdocs has no ephemeral-port mode.

**Failure scenario:** `acs site docs --port 0` (or `acs site --docs-port 0`) passes
validation and spawns `mkdocs serve --dev-addr 127.0.0.1:0`, producing a confusing
mkdocs-side failure instead of an upfront `port must be 1–65535` error. The Kanban
parser legitimately needs `0` (OS-assigned ephemeral port for serve-smoke tests);
the docs parser should reject it.

**Suggested fix:** in the docs port parser, reject `0` (use `n < 1` as the lower
bound, or special-case `0` with a clear message), keeping `0` valid only for the
Kanban engine.

### 2. `--open` on Windows passes the URL (which embeds `--host`) through `cmd /c start`

- **File:** `src/packages/cli/src/index.ts:1311`
- **Severity:** Low (self-inflicted; no trust boundary crossed)

`openBrowser` runs `spawn("cmd", ["/c", "start", "", url])` where
`url = http://${host}:${port}/` and `host` is the user-supplied `--host`.

**Failure scenario:** `acs site kanban --open --host '127.0.0.1" & calc & "'` lets
cmd.exe re-parse the `&` metacharacters → arbitrary command execution. It is
self-inflicted (own flag, own machine), so low severity, but trivially hardened.

**Suggested fix:** validate `--host` as a hostname/IP before building the URL, or
use a non-shell opener.

## Claims checked and refuted (for confidence)

These were surfaced by the finder sweep and verified against the real code as
**not** bugs:

- **Path-traversal guard is sound** (`index.ts:1086-1105`): decodes *before*
  resolving; `siteDir` has no trailing separator so `startsWith(siteDir + path.sep)`
  is correct; escapes (`/../../etc/passwd`, backslash variants) are caught;
  null-byte (`/%00…`) falls through to `404`; directory requests return `404`
  (code-review S2 fix). No bypass found.
- **YAML injection in `mkdocs.yml` `site_name` is not reachable** (`docs.ts:60`):
  `siteName` is always the constant `"ACS Artifacts"`; no call site passes a
  store/project name into `opts.siteName`. (Revisit only if that is wired up later.)
- **`broadcastReload` Set-mutation-during-iteration is safe** (`index.ts:1158-1164`):
  deleting the current element during `for…of` over a `Set` is well-defined in
  ECMAScript and does not skip later elements — not a bug.
- **No CLAUDE.md / AGENTS.md violations**: tests run against compiled `dist/`,
  `site/` + `site-docs/` stay out of validation/indexing, and the docs engine writes
  nothing under `artifacts/` (all verified by passing tests).

## Recommendation

Nothing blocking. Both findings are low-severity hardening:

- **#1** is a clean one-line fix (reject `0` in the docs port parser) and is worth
  doing before merge.
- **#2** is optional defense-in-depth.

The feature is safe to merge as-is if these are tracked as follow-ups instead.
