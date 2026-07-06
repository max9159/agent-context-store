# ACS Hybrid Site Plan — Kanban App + MkDocs Docs

Status: Proposed
Date: 2026-06-24
Supersedes the command surface in `ACS_STATIC_SITE_PLAN.md` (the static `acs site build` generator), which remains the technical basis for the Kanban engine.

## Requirement

Evolve `acs site` from a one-shot static generator into a hybrid local preview that can run **two independent rendering engines**, side by side, with a `mkdocs serve`-style live experience:

- `acs site kanban` — the existing zero-dependency ACS workflow app (Dashboard, Kanban, Task detail, Handoffs, Validation), served locally with live reload.
- `acs site docs` — an MkDocs + Material documentation site that renders the artifact Markdown files, equivalent to the `mkdocs serve` flow already used in the `project-context-store` repo.
- `acs site` — run **both** engines concurrently on separate ports, print both URLs, and tear both down together on Ctrl-C.

The two engines are complementary, not redundant:

| Engine | Strength | Cannot do |
| --- | --- | --- |
| Kanban (built-in) | Domain-aware: workflow state, Kanban columns, handoff chain, validation, audit timeline | Polished doc theme, full-text search, nav tree |
| Docs (MkDocs) | Mature Material theme, search, light/dark, clean Markdown reading | Any ACS workflow/relational state — it only renders `.md` files |

## Goals

- Keep the Kanban engine **zero-dependency** (Node built-ins only); no Python required to use ACS.
- Make the Docs engine **opt-in and gracefully degrading**: if MkDocs is not installed, `acs site docs` prints an install hint and exits non-fatally; `acs site` continues with Kanban only and warns.
- Provide a `mkdocs serve`-style experience for both engines: a long-running local server with live reload on artifact changes.
- Preserve the existing artifact / handoff / package / audit file layout. The site output stays disposable derived output.

## Non-Goals

- No authentication, no deployment, no database.
- No bundling or vendoring of MkDocs/Python into the npm package.
- No mutation of `artifacts/`, `handoffs/`, `packages/`, or `audit/` from either site.
- No Claude Code hooks in this iteration.

## Current System

- `acs site build [--task <ID>]` (`handleSite` in `src/packages/cli/src/index.ts`) generates a zero-dependency SPA under the resolved store root `site/`:
  - `site/index.html`, `site/assets/site.css`, `site/assets/site.js`, `site/data/model.json`.
  - `site.js` loads data via `fetch('data/model.json')`, so it **requires an HTTP origin** — opening `index.html` over `file://` is blocked by browser CORS. A `serve` action is therefore a real gap, not just convenience.
- `buildSiteModel()` (core) aggregates store state into a `SiteModel` (tasks, artifacts, handoffs, validation, Kanban state, timeline).
- The `project-context-store` repo (commits `00eb57e`, `d8a07da`, `edf8601`) demonstrates the MkDocs flow: `mkdocs.yml` with `docs_dir: artifacts`, `theme: material`, and a light/dark palette toggle, served via `mkdocs serve` at `http://127.0.0.1:8000/`.

## Existing Code to Reuse

- `buildSiteModel()` and `SiteModel` types — unchanged; the Kanban engine keeps consuming them.
- `handleSite()`, `buildSiteHtml()`, `buildSiteCss()`, `buildSiteJs()`, `writeFileUtf8()`, `toPosix()` in `src/packages/cli/src/index.ts`.
- `resolveStoreContext()` (core) for the resolved `storeDir` under which `site/` and the MkDocs workspace are written.
- `parseArgs()`, `getStringFlag()`, `getBoolFlag()` CLI helpers.
- Existing compiled-output test pattern under `src/test/`.

## Command Surface

```bash
acs site                       # run BOTH engines concurrently (serve), print both URLs
acs site kanban                # serve the built-in workflow app (default action: serve)
acs site docs                  # serve the MkDocs Material docs site
```

Per-engine flags:

```bash
acs site kanban [--build-only] [--port <N>] [--host <H>] [--no-watch] [--open] [--task <ID>]
acs site docs   [--build-only] [--port <N>] [--host <H>] [--open]
acs site        [--kanban-port <N>] [--docs-port <N>] [--host <H>] [--no-watch] [--open] [--task <ID>]
```

Defaults:

| Flag | Default | Notes |
| --- | --- | --- |
| Kanban port | `8000` | Flagship engine on the round number. |
| Docs port | `8001` | Avoids clashing with Kanban when both run. |
| `--host` | `127.0.0.1` | Loopback only; never bind `0.0.0.0` by default. |
| watch | on | Disable with `--no-watch`. |
| `--build-only` | off | Generate output and exit (no server); replaces the old build flow. |
| `--open` | off | Open the default browser at the served URL. |

The previous `acs site build` command is **removed**, not aliased. `acs site kanban --build-only` is its direct replacement (same generated output under `site/`).

## Engine A — Kanban (built-in, zero-dependency)

Adds a long-running server on top of the existing generator. No new runtime dependencies.

1. **Build step (`rebuild`)** — extract the current write logic from `handleSite` into a reusable `rebuildKanbanSite(cwd, taskFilter)` that returns `{ siteDir, storeDir }` and writes `index.html` / `assets` / `data/model.json`. `acs site kanban --build-only` calls this and exits.

2. **Static server** — Node built-in `http.createServer` serving files under `siteDir`, with a minimal content-type map and path-traversal guard (resolve and verify the path stays within `siteDir`).

3. **Live reload (SSE, no WebSocket dependency)** — a `GET /__livereload` endpoint holds an `text/event-stream` connection. `buildSiteJs()` gets a small injected tail:

   ```js
   if (location.protocol !== 'file:') {
     try { new EventSource('/__livereload').onmessage = function () { location.reload(); }; } catch (e) {}
   }
   ```

4. **Watch + debounce** — `fs.watch(storeDir/{artifacts,handoffs,audit}, { recursive: true })`, debounced ~150 ms, re-runs `rebuildKanbanSite` (model.json only is enough) and writes `data: reload\n\n` to every open SSE client. Note: `recursive` watch is supported on Windows and macOS; on Linux fall back to watching the top-level dirs (documented limitation).

5. **Lifecycle** — print `OK ACS kanban serving at http://<host>:<port>/`, register SIGINT to close the server and SSE clients cleanly.

## Engine B — Docs (MkDocs + Material)

CLI orchestrates an external `mkdocs` process; it does not reimplement MkDocs.

1. **Preflight** — detect `mkdocs` on PATH (`mkdocs --version`). If missing, print:

   ```text
   notice MkDocs not found. Install with:
     pip install mkdocs mkdocs-material
   Skipping docs engine.
   ```

   `acs site docs` exits 0 (non-fatal). `acs site` continues Kanban-only.

2. **Workspace generation** — write a generated, disposable MkDocs workspace under the resolved store root (e.g. `site-docs/mkdocs.yml`), regenerated on each run, never hand-edited:
   - `site_name: ACS Artifacts` (or store/project name when available).
   - `docs_dir` pointed at the resolved `artifacts/` directory.
   - `theme: material` with the light/dark `palette` toggle mirroring the `project-context-store` config.
   - **Do not write any file into `artifacts/`.** `validateContextStore()` (declared `core/src/index.ts:947`, `artifacts/*.md` scan at `:970`) and `findArtifactsForTask()` (`:2683`, scan `:2684`) walk every `.md` under `artifacts/` and run schema + task-first path validation, so a generated `artifacts/index.md` would make `acs validate` fail (missing-frontmatter schema errors, "unknown artifact type", "expected task-first artifact path"). The docs engine must keep `artifacts/` pristine.
   - ACS artifacts are nested as `artifacts/{task_id}/{type}/{artifact_id}.md`; for v1 set `docs_dir` to the resolved `artifacts/` and rely on MkDocs/Material **auto-nav** with **no generated landing page**. (Follow-up: build a staged docs tree under `site-docs/docs/` — copy artifact `.md` in, plus a generated `index.md` and explicit `nav:` — so the landing page never touches `artifacts/`.)

3. **Serve vs build**:
   - Default (`acs site docs`): spawn `mkdocs serve --dev-addr <host>:<port> -f site-docs/mkdocs.yml`. MkDocs provides its own live reload.
   - `--build-only`: run `mkdocs build -f site-docs/mkdocs.yml -d <storeDir>/site-docs/_site`.

4. **Lifecycle** — stream child stdout/stderr through with an `[docs]` prefix; forward SIGINT to the child.

## `acs site` — Concurrent Mode

1. Resolve store context once.
2. Run the MkDocs preflight. If absent, warn and run Kanban only.
3. Start Engine A (Kanban) on `--kanban-port` (default 8000) and Engine B (Docs) on `--docs-port` (default 8001) concurrently.
4. Print a combined banner:

   ```text
   OK ACS site running:
     kanban  http://127.0.0.1:8000/   (workflow app, live reload)
     docs    http://127.0.0.1:8001/   (mkdocs material)
   Watching artifacts/ handoffs/ audit/ — Ctrl-C to stop both.
   ```

5. A single SIGINT handler shuts down the Node server, the SSE clients, and the MkDocs child process. If either engine fails to start (e.g. port in use), report which one and keep the other running.

## Affected Features and Modules

| Area | Files / modules | Impact |
| --- | --- | --- |
| CLI command routing | `src/packages/cli/src/index.ts` | Replace the single `build` action in `handleSite` with `kanban` / `docs` / default-both dispatch. The old `build` action is removed. |
| Kanban serve | `src/packages/cli/src/index.ts` | Add `rebuildKanbanSite()`, `serveStatic()`, SSE handler, `fs.watch` loop, `openBrowser()`. |
| Live reload injection | `buildSiteJs()` in `src/packages/cli/src/index.ts` | Append the guarded `EventSource` snippet (no-op under `file://`). |
| Docs engine | `src/packages/cli/src/index.ts` (or new `src/packages/cli/src/docs.ts`) | MkDocs preflight, `mkdocs.yml` generation, `child_process.spawn` of `mkdocs serve/build`. |
| Help text | `printHelp()` in `src/packages/cli/src/index.ts` | Document the three new commands, flags, defaults, and the deprecation. |
| Generated output | `site/` and `site-docs/` under resolved store root | Both disposable derived output; must not feed indexing/validation. |
| Ignore rules | `.gitignore` (generated stores) / docs | Recommend ignoring `site/` and `site-docs/`. |
| Core public API | `src/packages/core/src/index.ts` | No change expected; `buildSiteModel()` is reused as-is. |
| Tests | `src/test/cli.spec.ts`, `src/test/integration.spec.ts` | Cover new dispatch, build-only output, serve smoke, deprecation alias, MkDocs-absent path. |
| Docs | `README.md`, `src/packages/cli/README.md` | Document the hybrid command surface and the optional MkDocs dependency. |

Unchanged (must not regress): artifact/handoff/package/audit layout, schemas, `acs init/new/validate/handoff/package/index/status`, skill installation, Claude Code hooks.

## Public API / CLI Impact

- New commands: `acs site`, `acs site kanban`, `acs site docs`.
- New flags: `--port`, `--kanban-port`, `--docs-port`, `--host`, `--no-watch`, `--open`, `--build-only` (plus existing `--task`).
- Removed: `acs site build` — replaced by `acs site kanban --build-only`.
- New **optional** external dependency for the docs engine only: `mkdocs` + `mkdocs-material` (Python, user-installed). The npm package gains no new dependency.

## Edge Cases and Risks

- **MkDocs absent** — handled by preflight; `acs site docs` non-fatal, `acs site` degrades to Kanban only.
- **Port in use** — report the conflicting engine/port and a `--port` hint; in concurrent mode keep the other engine alive.
- **`file://` open** — the Kanban app needs an origin; live-reload snippet is guarded so a `--build-only` site opened from disk does not error (it just won't auto-reload, and model.json fetch still needs a server — documented).
- **Recursive watch on Linux** — `fs.watch({recursive:true})` is unsupported on Linux; fall back to top-level watch and document it.
- **Nested artifact tree in MkDocs nav** — auto-nav may look deep; acceptable for v1, explicit nav (via a staged docs tree) is a follow-up.
- **No injected files in `artifacts/`** — the docs engine must not write `index.md` or any file under `artifacts/`; doing so breaks `acs validate` (schema + task-first path checks scan all `.md` there). Keep all generated docs assets under `site-docs/`.
- **Path traversal** in the static server — resolve requested paths and reject anything outside `siteDir`.
- **Derived output as input** — `site/` and `site-docs/` must be excluded from artifact discovery, validation, and `acs index`.
- **Windows vs POSIX `mkdocs` resolution** — detect via `mkdocs --version` through the shell; on Windows allow `mkdocs.exe`. Surface a clear error if Python/Scripts is not on PATH.

## Test Plan

CLI / integration tests:

- `acs site kanban --build-only` creates `site/index.html` and `site/data/model.json` (parity with the old `acs site build` output).
- `acs site build` is no longer recognized: it exits non-zero with an "unknown action" error pointing to `acs site kanban`.
- `acs site kanban` serve smoke: start on an ephemeral port, `GET /` returns 200, `GET /data/model.json` parses, `GET /__livereload` returns an event-stream header; then shut down.
- Static server rejects `GET /../../etc/passwd`-style traversal.
- MkDocs-absent path: stub PATH so `mkdocs` is missing → `acs site docs` exits 0 with the install hint; `acs site` warns and still serves Kanban.
- `acs index`, `acs validate`, `acs status` are unchanged after `site/` and `site-docs/` exist.

Manual checks:

- `acs site` shows both URLs; Kanban live-reloads after editing an artifact; MkDocs reflects the same edit; Ctrl-C stops both.
- Light/dark toggle works on the docs site.

## Verification Commands

```bash
pnpm build
pnpm test
pnpm test:integration
pnpm smoke
git diff --check
```

## Future Follow-Ups

- Explicit MkDocs `nav:` grouped by task / role, or `awesome-pages` integration.
- Full-text search surfaced from the Kanban app (reuse MkDocs/Lunr index).
- Shared port via a single reverse-proxy front so both engines live under one origin.
- `acs site --engine kanban|docs` selector as an alternative to the subcommands.
- Claude Code hook to rebuild the Kanban model after `acs handoff`/`acs new`.
- CI example publishing the MkDocs `--build-only` output as a static artifact.
