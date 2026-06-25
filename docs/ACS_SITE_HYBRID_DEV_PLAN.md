# ACS Hybrid Site — System/Development Plan

Status: Ready for implementation
Date: 2026-06-24
Design source of truth: `docs/ACS_SITE_HYBRID_PLAN.md` (decisions in that doc are settled and are NOT re-litigated here).
House-style reference: `docs/ACS_STATIC_SITE_PLAN.md`.

This is a planning artifact only. No source code is written here. The owning
implementer is the develop-by-plan agent; code changes land in
`src/packages/cli/src/index.ts` and a new `src/packages/cli/src/docs.ts` (docs
engine), plus tests under `src/test/` and docs.

## Requirement

Evolve `acs site` from a one-shot static generator into a hybrid local preview
with two independent rendering engines:

- `acs site kanban` — the existing zero-dependency ACS workflow SPA, now served
  over HTTP with live reload. Default action is **serve**; `--build-only`
  reproduces the old generator and exits.
- `acs site docs` — an opt-in MkDocs + Material docs site over the artifact
  Markdown, orchestrated as an external `mkdocs` child process with graceful
  degradation when MkDocs is absent.
- `acs site` (no subcommand) — run **both** engines concurrently on separate
  ports, print both URLs, and tear both down on a single Ctrl-C.

In ACS terms:

- Affected role/workflow: none of BA/SA/DEV/QA artifact mechanics change. This is
  a **visualization / preview** surface layered on existing read-only model
  aggregation (`buildSiteModel`).
- User-facing surface: **CLI command + bundled site templates** only. No core
  API change, no schema change, no template (artifact template) change, no
  handoff/package behavior change.

The old `acs site build` command is **removed, not aliased**. Its replacement is
`acs site kanban --build-only`, which writes the same output under `site/`.

## Current System

`acs site` is dispatched in `src/packages/cli/src/index.ts`:

- Command dispatch: `if (command === "site") { await handleSite(rest); return; }`
  (around line 323).
- `handleSite(rest)` (around line 865) requires `action === "build"`, otherwise
  throws `Unknown site action "<x>". Expected "build".`. It calls
  `buildSiteModel(process.cwd(), taskFilter)` (core), computes
  `siteDir = path.join(storeDir, "site")`, and writes:
  - `site/index.html` from `buildSiteHtml()` (line 909)
  - `site/assets/site.css` from `buildSiteCss()` (line 933)
  - `site/assets/site.js` from `buildSiteJs()` (line 975)
  - `site/data/model.json` (JSON of the `SiteModel`)
  It prints `OK site build complete` plus `created <path>` lines.
- `buildSiteJs()` ends with `fetch('data/model.json')` (line 1125), confirming
  the SPA **requires an HTTP origin** — `file://` is blocked by browser CORS. A
  real server is therefore a genuine gap, not just convenience.

Core (`src/packages/core/src/index.ts`):

- `buildSiteModel(rootDirInput, taskFilter?)` (line 1572) returns a `SiteModel`
  (`generatedAt`, `store: StoreInfo`, `validation`, `tasks`, `artifacts`,
  `handoffs`). `model.store.storeDir` and `model.store.mode` are present.
- `resolveStoreContext(inputDir)` (line 520) resolves in-repo `.acs/`,
  dedicated, and local-registry stores. **No core change is required** — the CLI
  keeps reading `storeDir` off `buildSiteModel(...).store`.

CLI arg helpers:

- `parseArgs(args)` (line 648): collects `positional` and `flags`. A `--flag`
  with no following value (or followed by another `--flag`) becomes boolean
  `true`; otherwise it consumes the next token as a string value.
- `getStringFlag(args, name)` (line 681): returns the flag only if it is a
  string.
- `requireFlag(args, name)` (line 673): string flag or throw.
- `getBoolFlag(args, name)` **does not currently exist** and must be added (see
  Step 1). Boolean flags today are read ad hoc via `args.flags[name]`.

Help text: `printHelp()` (line 798) lists `acs site build [--task <TASK_ID>]`
(line 824) and an example (lines 854-855). README documents `acs site build`
(README.md lines 292, 300-321, 346) and `src/packages/cli/README.md` may mirror
it.

Tests today (`src/test/cli.spec.ts` lines 623-740): a `describe("acs site
build")` block and a `describe("existing commands unaffected by site build")`
block. The shared test runner `runCli` (`src/test/helpers.ts` line 50) uses
`spawnSync` with a **30s timeout** — it cannot drive a long-running server. The
serve smoke tests must spawn the CLI with `spawn` (async, non-blocking) and kill
it explicitly.

## Existing Code to Reuse

- `buildSiteModel()` / `SiteModel` (core) — unchanged; both engines' Kanban
  rebuild consumes it.
- `buildSiteHtml()`, `buildSiteCss()`, `buildSiteJs()`, `writeFileUtf8()`,
  `toPosix()` in `src/packages/cli/src/index.ts` — reused; only `buildSiteJs()`
  is modified (live-reload tail).
- `parseArgs()`, `getStringFlag()`, `requireFlag()` CLI helpers; add `getBoolFlag()`.
- `resolveStoreContext()` (core, indirectly via `buildSiteModel().store`).
- `node:test` compiled-output test pattern + helpers (`makeTempDir`,
  `cleanupTempDir`, `runCli`, `exists`, `readText`, `readJson`).
- Node built-ins only for the Kanban engine: `node:http`, `node:fs`/`fs.watch`,
  `node:fs/promises`, `node:path`, `node:url`. `node:child_process` is used
  **only** for the docs engine (`mkdocs`) and the optional `--open` browser
  launch.

No new npm dependency is added. MkDocs/Python remains an optional, user-installed
external tool used only by the docs engine.

## Proposed Implementation

The Kanban engine, dispatch, and arg helpers land in
`src/packages/cli/src/index.ts`. The **docs engine is extracted into a new
module `src/packages/cli/src/docs.ts`** (preflight, `mkdocs.yml` generation, and
`child_process.spawn` of `mkdocs serve`/`build`). `index.ts` is already 1200+
lines, so the docs engine stays out of it. `handleSite` dispatch in `index.ts`
imports the docs entry points from `docs.ts`.

**ESM import specifier — use `./docs.js`, not `./docs.ts`.** The repo is
`module: NodeNext` (`tsconfig.base.json:4-5`) with `"type": "module"`, so
relative imports must carry the **compiled** `.js` extension:
`import { mkdocsPreflight, handleSiteDocs } from "./docs.js"`. Both packages are
single-file `index.ts` today, so there is no existing in-package relative-import
to copy — get this right or the build/runtime resolution breaks.

Suggested `docs.ts` exports: `mkdocsPreflight()`, `generateMkdocsWorkspace(...)`,
`handleSiteDocs(tail)`, and a `serveMkdocs(...)`/`buildMkdocs(...)` pair if the
serve and build paths are split. `handleSiteBoth` (in `index.ts`) imports
`mkdocsPreflight` and a `serveMkdocs` handle from `docs.ts` so it can start and
tear down Engine B. Keep the import direction one-way (`docs.ts` -> `index.ts`,
not back) to avoid a cycle: pass shared helpers/values (`parsePortFlag`,
`getBoolFlag` reads, `host`, `port`, `storeDir`, `awaitSigint`) into the docs
functions as arguments rather than importing them from `index.ts`, or keep the
tiny `parsePortFlag`/`getBoolFlag` reads duplicated in `docs.ts`. The TypeScript
build is `pnpm -r build` per package, so both files compile under the existing
CLI `tsconfig` with no config change.

### Step 1 — Arg helper: `getBoolFlag`

Add `function getBoolFlag(args: ParsedArgs, name: string): boolean` near
`getStringFlag` (line 681). Returns `true` when `args.flags[name] === true` or
when the flag is present as the string `"true"`; otherwise `false`. Used for
`--build-only`, `--open`, `--no-watch`.

Note on `--no-watch`: `parseArgs` stores it under the key `"no-watch"`. Watch is
on by default, so compute `watch = !getBoolFlag(args, "no-watch")`.

Add a small `parsePortFlag(args, name, fallback)` local helper (mirror the
`--max-tokens` integer validation already in `handlePackage`, lines 515-523):
parse a **non-negative** integer (`0`-`65535`), throw a clear error on a
negative/non-integer/out-of-range value, fall back to the default when the flag
is absent. `0` is explicitly allowed and means "OS-assigned ephemeral port"
(serve-smoke tests rely on it); only the requested value `0` is special — the
banner always prints the actual bound port (Step 4 / Step 5).

### Step 2 — Restructure `handleSite` dispatch

Replace the body of `handleSite(rest)` (lines 865-903). New shape:

```
async function handleSite(rest) {
  const [action, ...tail] = rest;
  if (action === "kanban")      return handleSiteKanban(tail);
  if (action === "docs")        return handleSiteDocs(tail);
  if (action === "build")       throw unknown-action error -> point to
                                "acs site kanban --build-only";
  if (action === undefined)     return handleSiteBoth(tail);   // bare `acs site`
  // any other token: treat as unknown action
  throw new Error(`Unknown site action "${action}". Expected "kanban",
                   "docs", or no subcommand. The old "acs site build" is now
                   "acs site kanban --build-only".`);
}
```

The removed-`build` branch must produce a **non-zero exit** with a message that
names the replacement, satisfying the test "`acs site build` is no longer
recognized" (design doc Test Plan). Throwing propagates to the top-level handler,
which already sets a non-zero exit code.

Edge: a bare `acs site` with leading flags only (e.g. `acs site --open`) — since
`--open` starts with `--`, `rest[0]` is `"--open"`, not a subcommand. Guard:
if `action` starts with `--`, treat the whole `rest` as flags for the
both-engines path (i.e. `action === undefined || action.startsWith("--")` →
`handleSiteBoth(rest)`).

### Step 3 — Extract the reusable Kanban build: `rebuildKanbanSite`

Extract the existing write logic from the old `handleSite` into:

```
async function rebuildKanbanSite(cwd: string, taskFilter?: string):
  Promise<{ siteDir: string; storeDir: string; model: SiteModel }>
```

Responsibilities (lifted verbatim from current lines 872-896):
- `const model = await buildSiteModel(cwd, taskFilter);`
- `siteDir = path.join(model.store.storeDir, "site")`
- `mkdir` `assets/` and `data/`
- write `data/model.json`, `assets/site.css`, `assets/site.js`,
  `index.html`.

The watch loop calls this on each change. For the watch path, regenerating only
`model.json` is sufficient (HTML/CSS/JS are static), but rewriting all four is
cheap and simplest — rewrite all four to avoid divergence. Keep the
`taskFilter`-empty notice (current lines 873-875) only on the initial
`--build-only` / serve entry, not on every watch rebuild.

### Step 4 — `handleSiteKanban(tail)`

Parse flags: `task` (string), `build-only` (bool), `port` (default `8000`),
`host` (default `127.0.0.1`), `watch` (default on; `--no-watch` disables),
`open` (bool). `--port 0` is **valid** and means "OS-assigned ephemeral port"
(used by serve-smoke tests); `parsePortFlag` must accept `0` as a special case
(a non-negative integer, not strictly positive) while still rejecting negatives
and non-integers.

Behavior:
- Always call `rebuildKanbanSite(process.cwd(), taskFilter)` first.
- If `--build-only`: print the same `OK site build complete` + `created ...`
  lines the old command printed (preserve output shape for parity tests), then
  return. No server.
- Else: start the server via `serveKanban({ siteDir, storeDir, host, port,
  watch, taskFilter })` (Step 5). After `listen`, read the **actual bound port**
  from `server.address().port` (this is the OS-assigned port when `--port 0` was
  passed) and print `OK ACS kanban serving at http://<host>:<actualPort>/` using
  that resolved port — never the requested `0`. Optionally `openBrowser(url)`
  (Step 8) with the resolved URL, then **await a SIGINT promise** so the process
  stays alive until Ctrl-C (Step 9).

### Step 5 — Kanban static server: `serveKanban` / `serveStatic` + SSE

Add an `http.createServer` request handler. Components:

`serveStatic(req, res, siteDir)`:
- Map `GET /` → `index.html`.
- Decode the URL path, strip query string, then resolve against `siteDir`.
- **Path-traversal guard**: `const resolved = path.resolve(siteDir, "." +
  urlPath)` (or join then resolve) and verify `resolved === siteDir ||
  resolved.startsWith(siteDir + path.sep)`. Reject anything outside with `403`.
  Covers `GET /../../etc/passwd` and encoded variants (decode first).
- Content-type map for the small set actually served: `.html`, `.css`, `.js`,
  `.json` (+ a default `application/octet-stream`). Stream the file; `404` when
  missing.

SSE handler `handleLiveReload(req, res, clients)`:
- For `GET /__livereload`: write headers `Content-Type: text/event-stream`,
  `Cache-Control: no-cache`, `Connection: keep-alive`, then hold the connection
  open. Add `res` to a `Set<ServerResponse>` of clients; remove on `close`.
- A helper `broadcastReload(clients)` writes `data: reload\n\n` to every open
  client.

Routing inside the server: if `req.url` starts with `/__livereload` → SSE; else
→ `serveStatic`.

`serveKanban` returns a handle `{ server, clients, port, closeAll() }` — `port`
is the actual bound port read from `server.address().port` after `listen`
(resolves `--port 0` to the OS-assigned port) — plus, when `watch` is on, the
watcher created in Step 6, so the lifecycle code can tear everything down and the
caller can print the real URL.

Port-in-use handling: attach a `server.on("error")` that detects `EADDRINUSE`
and reports `error kanban port <port> is in use — choose another with --port`.
In single-engine mode this is fatal (non-zero exit). In both-engines mode it must
not kill the other engine (Step 7). With `--port 0` `EADDRINUSE` cannot occur, so
ephemeral-port serve tests avoid this path entirely.

### Step 6 — Watch + debounce: `watchAndRebuild`

```
function watchAndRebuild(storeDir, cwd, taskFilter, onRebuilt):
  -> { close(): void }
```

- Watch `path.join(storeDir, sub)` for `sub` in `["artifacts", "handoffs",
  "audit"]`, each with `fs.watch(dir, { recursive: true })`, but only for dirs
  that `existsSync`. Wrap each `fs.watch` in try/catch so a missing dir or a
  platform that rejects recursive watch does not crash serve.
- Debounce ~150 ms: collapse bursts into a single rebuild. On fire:
  `await rebuildKanbanSite(cwd, taskFilter)` then call `onRebuilt()` (which calls
  `broadcastReload`). Swallow/print rebuild errors (e.g. a transient half-written
  artifact) without killing the server.
- **Linux recursive caveat**: `fs.watch({recursive:true})` is unsupported on
  Linux. Fall back to watching the top-level dirs only (already what we do — we
  do not recurse manually). Document the limitation in help/README; do not add a
  manual recursive walker in v1.
- Exclude derived output: we watch only `artifacts/`, `handoffs/`, `audit/`, so
  `site/` and `site-docs/` are never watched and cannot trigger a self-rebuild
  loop.

### Step 7 — Live-reload injection in `buildSiteJs()`

Append a guarded tail to the JS lines array (after the `fetch('data/model.json')`
block, before the IIFE close at line 1129). The tail must be `file://`-safe so a
`--build-only` site opened from disk does not throw:

```
"  if (location.protocol !== 'file:') {",
"    try { new EventSource('/__livereload').onmessage = function () { location.reload(); }; } catch (e) {}",
"  }",
```

This changes the generated `assets/site.js` only. `buildRendererJs()` (the
unit-tested renderer, line 1143) is a separate function and stays untouched.

### Step 8 — `openBrowser(url)`

Optional `--open`. Use `child_process.spawn` of the platform opener, detached and
unref'd so it never blocks shutdown:
- win32: `cmd /c start "" <url>`
- darwin: `open <url>`
- else: `xdg-open <url>`
Wrap in try/catch; a failed open is a warning, never fatal.

### Step 9 — Lifecycle / SIGINT

Add a small `awaitSigint()` helper returning a Promise that resolves on the
first `SIGINT`. Each serve path:
- registers one SIGINT handler that closes the HTTP server, ends all SSE client
  responses, stops the watcher, and (docs/both) kills the MkDocs child;
- then resolves so `handleSite*` returns and the process exits cleanly.

Use `process.once("SIGINT", ...)` to avoid double-teardown. Ensure SSE responses
are ended (`res.end()`) so Node does not hang on open sockets.

### Step 10 — Docs engine (new module `src/packages/cli/src/docs.ts`)

The entire docs engine — preflight, workspace generation, and `mkdocs`
spawning — lives in `src/packages/cli/src/docs.ts`, imported by `handleSite`
dispatch and `handleSiteBoth` in `index.ts`.

`mkdocsPreflight(): Promise<boolean>` — run `mkdocs --version` via
`child_process.spawn` (through the shell on win32 to resolve `mkdocs.exe`/Scripts
on PATH). Resolve `true` on exit code 0, `false` otherwise (ENOENT included). On
`false`, print:

```
notice MkDocs not found. Install with:
  pip install mkdocs mkdocs-material
Skipping docs engine.
```

`generateMkdocsWorkspace(storeDir, opts): { configPath, docsDir }`:
- Workspace dir `site-docs/` under `storeDir`; write `site-docs/mkdocs.yml`
  fresh each run (never hand-edited).
- `site_name: ACS Artifacts` (use store/project name when readily available).
- `docs_dir` → the resolved `artifacts/` directory
  (`path.join(storeDir, "artifacts")`).
- `theme: material` with the light/dark `palette` toggle mirroring the
  `project-context-store` config referenced in the design doc.
- **Write NO file into `artifacts/` — in particular, no generated
  `artifacts/index.md`.** This is a correctness requirement, not a preference:
  `validateContextStore()` (declared `core/src/index.ts:947`, `artifacts/*.md`
  scan at `:970`) and `findArtifactsForTask()` (`:2683`, scan `:2684`) walk every
  `.md` under `artifacts/` and run schema + task-first path
  validation, so a frontmatter-less `index.md` there would make `acs validate`
  fail (missing-frontmatter schema errors, "unknown artifact type", "expected
  task-first artifact path"). `artifacts/` stays pristine.
- For v1, rely on MkDocs/Material **auto-nav** over the nested
  `artifacts/{task}/{type}/{id}.md` tree with **no generated landing page**. A
  curated landing page + explicit `nav:` via a staged docs tree under
  `site-docs/docs/` (copy artifacts in, never write into `artifacts/`) is a
  follow-up. This matches the updated design doc (`ACS_SITE_HYBRID_PLAN.md`
  workspace-generation section).

`handleSiteDocs(tail)`:
- Flags: `build-only` (bool), `port` (default `8001`), `host` (default
  `127.0.0.1`), `open` (bool). (`mkdocs serve` binds the port itself; it does not
  support `--port 0` auto-assign the way the Node server does, so docs serve
  tests are not the ephemeral-port path — they are gated on MkDocs being present
  and otherwise skipped.)
- Run preflight. If absent → print hint, **exit 0** (non-fatal), return.
- Generate the workspace.
- Serve: `spawn("mkdocs", ["serve", "--dev-addr", "<host>:<port>", "-f",
  "<storeDir>/site-docs/mkdocs.yml"])`; stream child stdout/stderr with an
  `[docs]` prefix; forward SIGINT to the child; await child exit / SIGINT.
- `--build-only`: `spawn("mkdocs", ["build", "-f",
  "<storeDir>/site-docs/mkdocs.yml", "-d",
  "<storeDir>/site-docs/_site"])`, await exit, print result.

### Step 11 — Both-engines mode: `handleSiteBoth(rest)`

- Flags: `kanban-port` (default `8000`), `docs-port` (default `8001`), `host`
  (default `127.0.0.1`), `watch` (default on), `open` (bool), `task` (string).
- Resolve store context once via the first `rebuildKanbanSite` call.
- Run `mkdocsPreflight()`. If absent → warn and run Kanban only.
- Start Engine A (Kanban serve) on `kanban-port`; start Engine B (Docs serve) on
  `docs-port` if MkDocs present.
- If either engine fails to start (e.g. `EADDRINUSE`), report which engine/port
  and keep the other running.
- Print the combined banner from the design doc, using the **actual bound Kanban
  port** (from the `serveKanban` handle's `port`, resolving `--kanban-port 0`):

```
OK ACS site running:
  kanban  http://127.0.0.1:8000/   (workflow app, live reload)
  docs    http://127.0.0.1:8001/   (mkdocs material)
Watching artifacts/ handoffs/ audit/ — Ctrl-C to stop both.
```

- One SIGINT handler tears down both (Node server + SSE + watcher + MkDocs
  child).

**Docs readiness for the banner.** Unlike Kanban (bound port known synchronously
from `server.address().port`), `mkdocs serve` has no programmatic ready signal —
readiness can only be inferred from a child stdout line (e.g. `Serving on
http://127.0.0.1:8001/`). v1 keeps it simple: print the docs URL from the
*requested* `--docs-port` immediately after spawn (MkDocs binds the port it is
told), and let MkDocs' own `[docs]`-prefixed stdout confirm readiness. Do not
block the combined banner waiting on MkDocs. If the docs child exits non-zero
shortly after spawn (e.g. port in use), report it and keep Kanban running.

### Step 12 — Help text and docs

`printHelp()`:
- Replace the `acs site build [--task <TASK_ID>]` usage line (line 824) and the
  two examples (lines 854-855) with:

```
  acs site [--kanban-port <N>] [--docs-port <N>] [--host <H>] [--no-watch] [--open] [--task <ID>]
  acs site kanban [--build-only] [--port <N>] [--host <H>] [--no-watch] [--open] [--task <ID>]
  acs site docs [--build-only] [--port <N>] [--host <H>] [--open]
```

- Add a short note that `acs site build` is removed; use
  `acs site kanban --build-only`.
- Clarify in help/README that `--no-watch` affects **only the Kanban engine**.
  The docs engine relies on MkDocs' own live-reload, which `--no-watch` does not
  govern; a user passing `--no-watch` to `acs site` should not expect MkDocs
  reload to be silenced.

`README.md` (lines 292, 300-321, 346) and `src/packages/cli/README.md`: document
the three commands, defaults table, the optional MkDocs dependency
(`pip install mkdocs mkdocs-material`), and that `site/` + `site-docs/` are
disposable derived output. **`.gitignore` is not automated by `acs init` in
v1** — README/CLI README carry a recommendation to ignore `site/` and
`site-docs/` for generated stores, and that is the only place this is surfaced.

## Expected File Changes

| File | Change | Required? |
| --- | --- | --- |
| `src/packages/cli/src/index.ts` | Rewrite `handleSite` dispatch; add `getBoolFlag`, `parsePortFlag` (accepts `0`), `rebuildKanbanSite`, `handleSiteKanban`, `serveKanban`/`serveStatic`, `handleLiveReload`/`broadcastReload`, `watchAndRebuild`, `openBrowser`, `awaitSigint`, `handleSiteBoth`; modify `buildSiteJs` (live-reload tail); update `printHelp`. Import docs entry points from `./docs.js` (NodeNext ESM — `.js`, not `.ts`). Add `import http from "node:http"`, `{ watch } from "node:fs"`, `{ spawn } from "node:child_process"`. | Required |
| `src/packages/cli/src/docs.ts` | **New module.** Docs engine: `mkdocsPreflight`, `generateMkdocsWorkspace` (writes only `site-docs/mkdocs.yml`, never touches `artifacts/`), `handleSiteDocs`, `serveMkdocs`/`buildMkdocs`. One-way import from `index.ts` only (no cycle). | Required |
| `src/packages/core/src/index.ts` | None. `buildSiteModel` / `resolveStoreContext` reused as-is. | No change |
| `src/assets/schemas/`, `src/assets/templates/` | None. | No change |
| `src/test/cli.spec.ts` | Replace the `acs site build` describe block with `acs site kanban` (build-only parity + removed-`build` error). Add MkDocs-absent docs test. | Required |
| `src/test/integration.spec.ts` | Add a serve-smoke scenario (spawn with `--port 0` → parse bound port from stdout → HTTP probes → kill), a path-traversal test, a both-mode-degrades test, and an unaffected-after-`site-docs` regression (`acs validate` stays clean). | Required |
| `README.md` | Document the hybrid command surface + optional MkDocs dep; recommend ignoring `site/` and `site-docs/` (no init automation). | Required |
| `src/packages/cli/README.md` | Mirror command reference if the existing sync flow requires it. | Required if mirrored |
| `docs/ACS_SITE_HYBRID_DEV_PLAN.md` | This plan. | Done |

## Public API / CLI Impact

- New commands: `acs site`, `acs site kanban`, `acs site docs`.
- New flags: `--port`, `--kanban-port`, `--docs-port`, `--host`, `--no-watch`,
  `--open`, `--build-only` (plus existing `--task`).
- Removed: `acs site build` — now errors with a pointer to
  `acs site kanban --build-only`.
- New `buildSiteJs()` output contains a guarded `EventSource('/__livereload')`
  tail (no-op under `file://`).
- New **optional** external dependency for the docs engine only: `mkdocs` +
  `mkdocs-material` (Python, user-installed). The npm package gains **no** new
  dependency.
- No core public API (`agent-context-store-core`) signature change.

## Migration Impact

- Storage: none. No artifact/handoff/package/audit layout, schema, or template
  change. `site/` is unchanged in shape; `site-docs/` is new disposable derived
  output under the resolved store root.
- Both `site/` and `site-docs/` must stay excluded from artifact discovery,
  validation, and `acs index` (they already are — scanners only walk known ACS
  dirs; `site-docs/` follows the same exclusion as `site/`). The docs engine
  writes **nothing** under `artifacts/` (only `site-docs/mkdocs.yml`), so there
  is no risk of a generated Markdown file tripping the `artifacts/` schema /
  task-first scanners in `validateContextStore()` (`core/src/index.ts:970`) or
  `findArtifactsForTask()` (`:2684`). A regression test asserts `acs validate`
  stays clean after `acs site docs --build-only`.
- No data migration. Existing stores keep working; users who scripted
  `acs site build` must switch to `acs site kanban --build-only` (documented
  breaking change, intentional per the design).

## Edge Cases and Risks

- **MkDocs absent** — preflight makes `acs site docs` non-fatal (exit 0); both
  mode degrades to Kanban-only with a warning.
- **Port in use** — report the conflicting engine/port and `--port` hint;
  in both mode keep the other engine alive.
- **`file://` open** — live-reload tail is guarded; a `--build-only` site opened
  from disk does not error, but `model.json` fetch still needs a server
  (documented limitation).
- **Path traversal** — `serveStatic` resolves and rejects anything outside
  `siteDir` (covers `/../../etc/passwd` and percent-encoded variants; decode
  before resolving).
- **Recursive watch on Linux** — `fs.watch({recursive:true})` unsupported; fall
  back to top-level watch, documented. Wrap each watch in try/catch.
- **Watch self-loop** — never watch `site/` or `site-docs/`; only
  `artifacts/`/`handoffs/`/`audit/`.
- **No files written under `artifacts/`** — the docs engine must not write
  `index.md` or any other file under `artifacts/`; doing so breaks `acs validate`
  (schema + task-first path checks scan every `.md` there — `core/src/index.ts:970`
  and `:2684`). All generated docs assets stay under `site-docs/`
  (`mkdocs.yml` for v1). Regression-tested.
- **SIGINT teardown** — close HTTP server, end SSE responses, stop watcher, kill
  MkDocs child; use `process.once` to avoid double-teardown and hung sockets.
- **Windows signal semantics** — this repo is developed on Windows 11. Node emits
  a synthetic `SIGINT` on console Ctrl-C, so the Node server / SSE / watcher
  teardown works, but `child.kill("SIGINT")` to the `mkdocs` child is **not**
  delivered as a real POSIX signal on win32 — it terminates the child
  unconditionally rather than letting MkDocs shut down gracefully. Acceptable for
  v1 (the child is disposable); note it so the hard-terminate is not mistaken for
  a bug.
- **Windows `mkdocs` resolution** — detect via `mkdocs --version` through the
  shell; allow `mkdocs.exe`; surface a clear error when Python/Scripts is not on
  PATH.
- **Test runner can't hold a server** — `runCli` (`spawnSync`, 30s) blocks until
  exit; serve tests must use async `spawn` + explicit kill, never `runCli`.
- **No fixed test port** — serve tests pass `--port 0`; the CLI binds an OS
  ephemeral port and prints the actual port, which the test parses from stdout.
  This eliminates fixed-port flakiness and `EADDRINUSE` retries.
- **CI without MkDocs** — docs serve/build tests must not assume MkDocs is
  installed; only the MkDocs-absent path is asserted deterministically. Any
  MkDocs-present assertion must be skipped when preflight fails.
- **Derived output as input** — `site/` and `site-docs/` excluded from
  discovery/validation/index (regression-tested).

## Test Plan

Plan-to-test mapping (each planned behavior → a concrete test or an explicit
reason). Compiled-output `node:test` pattern, temp dirs, `runCli` for one-shot
commands, async `spawn` for serve.

`src/test/cli.spec.ts` — replace the `acs site build` block:

1. **build-only parity** — `acs site kanban --build-only` creates
   `.acs/site/index.html`, `.acs/site/data/model.json`, `.acs/site/assets/site.css`,
   `.acs/site/assets/site.js`; exit 0. (Mirrors old lines 636-658.)
2. **build-only `--task` filter** — `acs site kanban --build-only --task SITE-001`
   limits `model.json` tasks/artifacts to `SITE-001`. (Mirrors old lines 672-682.)
3. **build-only reports paths** — stdout includes a generated path. (old 684-688)
4. **build-only nonexistent task** — prints a notice, exits 0. (old 696-700)
5. **removed `build`** — `acs site build` exits non-zero and the message names
   `acs site kanban --build-only`. (design Test Plan)
6. **help** — `--help` mentions `acs site kanban` and `acs site docs` and no
   longer advertises `site build` as a current command.
7. **live-reload tail present** — `acs site kanban --build-only` then read
   `assets/site.js`; assert it contains `__livereload` and the `file:` guard.
   (Static assertion, no server needed.)
8. **docs preflight absent** — run `acs site docs` and assert exit 0 with stdout
   containing the `pip install mkdocs mkdocs-material` hint. **PATH-stub
   mechanism (note: `isolatedEnv` does NOT touch `PATH` — it only overrides
   `APPDATA/HOME/USERPROFILE/XDG_DATA_HOME`, `helpers.ts:100-108`).** Add a small
   dedicated helper that runs the CLI with a minimal but functional `PATH` that
   omits any directory containing `mkdocs`: `env: { ...process.env, PATH:
   <stubPath> }` passed through `runCli`'s `env` option (`helpers.ts:51-53`,
   forwarded to `spawnSync`). On win32 the docs preflight spawns through the
   shell, so `PATH` must still include the system dir that holds `cmd.exe`
   (e.g. `C:\Windows\System32`) and the Node dir — do not empty `PATH` outright,
   or Node's own child-process/shell resolution breaks and the test fails for the
   wrong reason. The helper should construct `stubPath` from the real `PATH`
   minus entries that resolve `mkdocs`. This is a one-shot exit, safe for `runCli`.

`src/test/integration.spec.ts` — new scenarios (async spawn, no `runCli`):

9. **kanban serve smoke** — init store + one artifact; `spawn` the CLI with
   `["site", "kanban", "--port", "0", "--no-watch"]`; read stdout until the
   `OK ACS kanban serving at http://127.0.0.1:<port>/` banner appears and parse
   the **actual bound port** from it; poll until `GET /` returns 200; assert
   `GET /data/model.json` parses as JSON; assert `GET /__livereload` response
   header `content-type` includes `text/event-stream` (then abort that request);
   send SIGINT/kill the child; assert it exits. `--port 0` removes fixed-port
   flakiness and `EADDRINUSE`.
10. **path traversal rejected** — same server; `GET /../../etc/passwd` (and an
    encoded `%2e%2e%2f` variant) returns 403/404, never file contents.
11. **live reload broadcast (optional, best-effort)** — with watch on, open an
    SSE connection, touch an artifact, assert a `reload` event arrives within a
    timeout. If flaky on CI, downgrade to a manual check and document why
    (timing-sensitive `fs.watch`); keep tests 9-10 as the deterministic core.
12. **both-mode degrades without MkDocs** — `spawn` `acs site --kanban-port 0`
    with the same shell-safe PATH stub as test #8 (omit `mkdocs`, keep the
    system/Node dirs); parse the bound Kanban port from the banner; assert the
    banner warns about docs and still serves Kanban (`GET /` 200 on the bound
    port); kill.
13. **`acs validate` stays clean after docs build-only** (correctness
    regression for decision #2) — init a store with real artifacts; if MkDocs is
    present run `acs site docs --build-only`, then assert `acs validate` exits 0
    and `artifacts/` contains no new `.md` (in particular no `index.md`); assert
    `site-docs/mkdocs.yml` exists and lives only under `site-docs/`. When MkDocs
    is absent, still assert the docs engine wrote nothing into `artifacts/` by
    invoking `generateMkdocsWorkspace` indirectly via the non-fatal path, or skip
    the MkDocs-dependent build and keep the directory-exclusion half (create a
    `site-docs/` dir on disk, run `acs index`/`acs validate`/`acs status`, all
    exit 0, `index.json` excludes `site-docs/` paths).

Explicitly not automated (reasons): MkDocs serve live-reload rendering and the
Material light/dark toggle — require a running MkDocs install and a browser;
covered by the design doc's manual checks. Browser `--open` launch — side-effect
on the host desktop; covered by a unit assertion that `openBrowser` picks the
right command per platform if extracted, otherwise manual.

## Verification Commands

```bash
pnpm build
pnpm test
pnpm test:integration
pnpm smoke
git diff --check
```

Targeted single-spec runs during development:

```bash
pnpm build && node --experimental-strip-types --test src/test/cli.spec.ts
pnpm build && node --experimental-strip-types --test src/test/integration.spec.ts
```

`pnpm smoke` (`node src/packages/cli/dist/index.js --help`) must still exit 0 and
now show the three `acs site` forms.

## Non-Goals

- No authentication, deployment, or database.
- No bundling/vendoring of MkDocs/Python into the npm package; no new npm
  dependency.
- No mutation of `artifacts/`, `handoffs/`, `packages/`, or `audit/` from either
  engine. Neither engine writes any file under `artifacts/` (a generated
  `index.md` there would break `acs validate`); all docs output stays under
  `site-docs/`.
- No explicit MkDocs `nav:` grouping in v1 (auto-nav only).
- No Claude Code hooks in this iteration.
- No core API or schema/template changes.
- No `acs site build` alias — it is removed.

## Resolved Decisions

The four previously-open questions are now settled and folded into the plan above:

1. **Docs engine module** — extracted into a new `src/packages/cli/src/docs.ts`
   (preflight, `mkdocs.yml` generation, `child_process.spawn`); `index.ts` stays
   under control. See Proposed Implementation intro, Step 10, and the file table.
2. **No file under `artifacts/`** — the docs engine writes only
   `site-docs/mkdocs.yml`; `docs_dir` points at `artifacts/` and v1 relies on
   MkDocs/Material auto-nav with no generated landing page. Writing
   `artifacts/index.md` would break `acs validate` (`core/src/index.ts:970`,
   `:2684`). A curated landing page via a staged `site-docs/docs/` tree is a
   follow-up. Consistent with the updated `ACS_SITE_HYBRID_PLAN.md`. See Step 10,
   Migration Impact, Edge Cases, and Test #13.
3. **Ephemeral test ports** — the Kanban server supports `--port 0` (OS-assigned)
   and prints the actual bound port from `server.address().port`; serve-smoke
   tests pass `--port 0` and parse the port from stdout. See Step 1, Step 4,
   Step 5, Edge Cases, and Tests #9/#12.
4. **`.gitignore`** — not automated by `acs init` in v1; README/CLI README carry
   a recommendation to ignore `site/` and `site-docs/`. See Step 12 and the
   file-changes table.
