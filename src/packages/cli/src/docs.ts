import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

// ─── Docs engine (MkDocs + Material) ─────────────────────────────────────────
//
// This module is imported by index.ts via "./docs.js" (NodeNext ESM — compiled
// extension). Keep imports one-way: docs.ts must NOT import from index.ts.
// Pass any shared values (port, host, storeDir, etc.) as function arguments.

const IS_WIN = process.platform === "win32";

/**
 * Resolved mkdocs invocation target: an absolute (or bare, as last resort)
 * command plus whether it must be run through a shell.
 *
 * `shell: false` is always used on POSIX (unchanged) and for the common
 * Windows case where mkdocs resolves to a native `.exe`/`.com` launcher
 * (what `pip`'s console_scripts generate on Windows) — Node can spawn those
 * directly, so args reach mkdocs verbatim with no shell re-parsing and no
 * cmd.exe `%VAR%` expansion risk.
 *
 * `shell: true` is only used as a fallback when mkdocs resolves to a
 * `.bat`/`.cmd` shim. Windows/Node cannot spawn a batch file directly without
 * an interpreter — `spawn(path/to/foo.cmd, args, { shell: false })` throws
 * EINVAL synchronously (verified on Node 22) — so cmd.exe is unavoidable
 * there. That fallback is not the common case for a pip install.
 */
interface ResolvedMkdocsCommand {
  command: string;
  shell: boolean;
}

let cachedResolution: ResolvedMkdocsCommand | undefined;

/**
 * Locate the mkdocs executable on PATH. Cached for the process lifetime
 * (PATH is not expected to change mid-run) so preflight and every spawn
 * agree on the exact same resolved target.
 */
function resolveMkdocsCommand(): ResolvedMkdocsCommand {
  if (!IS_WIN) {
    return { command: "mkdocs", shell: false };
  }
  if (cachedResolution) return cachedResolution;

  const dirs = (process.env["PATH"] ?? process.env["Path"] ?? "").split(path.delimiter).filter(Boolean);

  // Prefer a native, directly-spawnable launcher.
  for (const dir of dirs) {
    for (const name of ["mkdocs.exe", "mkdocs.com"]) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) {
        cachedResolution = { command: candidate, shell: false };
        return cachedResolution;
      }
    }
  }

  // Fall back to a batch/cmd shim if that is all that is on PATH (some
  // conda/pipx installs). This still requires cmd.exe as the interpreter.
  for (const dir of dirs) {
    for (const name of ["mkdocs.cmd", "mkdocs.bat"]) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) {
        cachedResolution = { command: candidate, shell: true };
        return cachedResolution;
      }
    }
  }

  // Not found on PATH at all. mkdocsPreflight() (which uses this same
  // resolution) will report absence before any spawn is attempted in the
  // normal flow, so this is only reached if PATH changed after preflight.
  cachedResolution = { command: "mkdocs", shell: true };
  return cachedResolution;
}

/**
 * Quote an argument for the rare shell:true (batch-shim) fallback path.
 * Windows paths cannot contain a double quote, so this is always safe.
 * NOTE: this does NOT suppress cmd.exe `%VAR%` expansion — quoting a string
 * for cmd.exe prevents whitespace/redirection re-parsing but does not
 * disable percent-expansion, which is a property of cmd.exe's own parser.
 * This is a documented residual limitation of the batch-shim fallback only;
 * the common (.exe) path above is immune to it entirely.
 */
function batchQuote(value: string): string {
  return `"${value}"`;
}

export interface MkdocsHandle {
  kill(): void;
  waitForExit(): Promise<number | null>;
}

interface SpawnMkdocsOpts {
  /** How to wire the child's stdin. Serve mode inherits; background ignores. */
  stdin?: "inherit" | "ignore";
}

/**
 * The single mkdocs spawn wrapper. Every mkdocs invocation (serve, build,
 * background serve) goes through here so the spawn config and the `[docs]`
 * stdout/stderr prefixing live in exactly one place.
 *
 * Returns a handle exposing `kill()` and `waitForExit()`. The exit promise
 * resolves with the child's exit code (or null on spawn error).
 */
function spawnMkdocs(args: string[], opts: SpawnMkdocsOpts = {}): MkdocsHandle {
  const resolved = resolveMkdocsCommand();
  const spawnArgs = resolved.shell ? args.map(batchQuote) : args;
  // shell:true means cmd.exe re-parses the whole command line, so the resolved
  // shim path (which may live under a directory with spaces) needs quoting too.
  const command = resolved.shell ? batchQuote(resolved.command) : resolved.command;
  const child = spawn(command, spawnArgs, {
    shell: resolved.shell,
    stdio: [opts.stdin ?? "inherit", "pipe", "pipe"],
  });

  if (child.stdout) {
    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(`[docs] ${String(chunk)}`);
    });
  }
  if (child.stderr) {
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(`[docs] ${String(chunk)}`);
    });
  }

  const exitPromise: Promise<number | null> = new Promise((resolve) => {
    let settled = false;
    const done = (code: number | null) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    child.on("close", (code) => done(code));
    child.on("error", (err) => {
      console.error(`[docs] error: ${err.message}`);
      done(null);
    });
  });

  return {
    kill: () => {
      try {
        child.kill();
      } catch {
        // ignore
      }
    },
    waitForExit: () => exitPromise,
  };
}

/**
 * Run `mkdocs --version` to detect if MkDocs is present on PATH.
 * Resolves true on exit-code 0, false for any failure (including ENOENT).
 *
 * Uses the same resolveMkdocsCommand() resolution as every other mkdocs
 * spawn so preflight and the actual serve/build invocation agree on exactly
 * which binary is being run.
 */
export function mkdocsPreflight(): Promise<boolean> {
  return new Promise((resolve) => {
    const resolved = resolveMkdocsCommand();
    const args = resolved.shell ? ["--version"].map(batchQuote) : ["--version"];
    const child = spawn(resolved.command, args, {
      shell: resolved.shell,
      stdio: "ignore",
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

export interface MkdocsWorkspaceOpts {
  siteName?: string;
}

export interface MkdocsWorkspaceResult {
  configPath: string;
  docsDir: string;
}

/**
 * Quote a value as a double-quoted YAML plain scalar, escaping backslashes
 * and double quotes. Without this, a value containing ` #` (a legal path
 * segment on Windows and POSIX, e.g. `D:\repos\proj #1\`) would be truncated
 * by YAML's unquoted-scalar comment rule — `#` only starts a comment when
 * preceded by whitespace, but an unquoted scalar has no other protection.
 */
function yamlQuote(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Write a disposable `site-docs/mkdocs.yml` under `storeDir`.
 * The `docs_dir` key points at the resolved `artifacts/` directory.
 *
 * IMPORTANT: this function writes NOTHING under `artifacts/`.
 * A generated file there would break `acs validate` (schema + task-first
 * path checks walk every .md under artifacts/).
 */
export async function generateMkdocsWorkspace(
  storeDir: string,
  opts: MkdocsWorkspaceOpts = {}
): Promise<MkdocsWorkspaceResult> {
  const siteDocsDir = path.join(storeDir, "site-docs");
  await mkdir(siteDocsDir, { recursive: true });

  const docsDir = path.join(storeDir, "artifacts");
  const siteName = opts.siteName ?? "ACS Artifacts";

  // Use forward-slashes in the yml so MkDocs works on all platforms
  const docsDirPosix = docsDir.split(path.sep).join("/");

  const yml = [
    `site_name: ${yamlQuote(siteName)}`,
    `docs_dir: ${yamlQuote(docsDirPosix)}`,
    "theme:",
    "  name: material",
    "  palette:",
    "    - media: \"(prefers-color-scheme: light)\"",
    "      scheme: default",
    "      primary: indigo",
    "      accent: indigo",
    "      toggle:",
    "        icon: material/brightness-7",
    "        name: Switch to dark mode",
    "    - media: \"(prefers-color-scheme: dark)\"",
    "      scheme: slate",
    "      primary: indigo",
    "      accent: indigo",
    "      toggle:",
    "        icon: material/brightness-4",
    "        name: Switch to light mode",
    "",
  ].join("\n");

  const configPath = path.join(siteDocsDir, "mkdocs.yml");
  await writeFile(configPath, yml, "utf8");

  return { configPath, docsDir };
}

export interface HandleSiteDocsOptions {
  /** Generate the workspace and run `mkdocs build`, then exit (no server). */
  buildOnly: boolean;
  /** Bind host for `mkdocs serve` (already validated by the caller). */
  host: string;
  /** Port for `mkdocs serve` (already validated; never 0). */
  port: number;
  /** Forward `--open` to `mkdocs serve` so it opens the browser (serve only). */
  open: boolean;
  /** Resolved store directory (caller reads it from getStoreInfo). */
  storeDir: string;
}

/**
 * Handle `acs site docs`.
 *
 * All flag parsing, host validation, port validation and store resolution are
 * done by the caller (index.ts) and passed in as a plain options object. This
 * keeps docs.ts free of any dependency on index.ts and ensures `--host` flows
 * through the shared `validateHost` guard before it reaches a shell spawn.
 *
 * Returns a Promise that resolves when the docs engine is done (either
 * `--build-only` finishes or `mkdocs serve` exits / SIGINT is received).
 * Rejects if `mkdocs serve` exits with a non-zero code that was NOT caused
 * by our own SIGINT-triggered kill (see runMkdocsServe).
 */
export async function handleSiteDocs(opts: HandleSiteDocsOptions): Promise<void> {
  const { buildOnly, host, port, open, storeDir } = opts;

  const present = await mkdocsPreflight();
  if (!present) {
    console.log("notice MkDocs not found. Install with:");
    console.log("  pip install mkdocs mkdocs-material");
    console.log("Skipping docs engine.");
    return; // exit 0 — non-fatal
  }

  const { configPath } = await generateMkdocsWorkspace(storeDir);

  if (buildOnly) {
    const siteOut = path.join(storeDir, "site-docs", "_site");
    await runMkdocsBuild(configPath, siteOut);
    return;
  }

  await runMkdocsServe(configPath, host, port, open);
}

/**
 * Build the `mkdocs serve` argument list. Shared by runMkdocsServe (foreground,
 * `acs site docs`) and startMkdocsServe (background, `acs site` both-engines
 * mode) so the two invocations can never drift apart.
 */
function buildServeArgs(configPath: string, host: string, port: number, open: boolean): string[] {
  const args = ["serve", "--dev-addr", `${host}:${port}`, "-f", configPath];
  if (open) args.push("--open");
  return args;
}

/**
 * Spawn `mkdocs serve` (foreground) and forward output with a `[docs]` prefix.
 * Wires SIGINT to kill the child and removes the listener on the child's own
 * exit so no listener leaks (which would otherwise try to kill an already-dead
 * child on a later SIGINT).
 *
 * When `open` is set, `--open` is forwarded to mkdocs so it opens the browser.
 *
 * Returns a Promise that resolves when the child exits with code 0 OR when
 * our own SIGINT handler killed it intentionally (a Windows-killed shell
 * child commonly reports exit code 1, which must NOT be treated as a real
 * failure). Rejects (throws) when the child exits non-zero for any other
 * reason — e.g. the configured port is already bound, or a broken config —
 * mirroring runMkdocsBuild's behavior so main()'s catch sets exit code 1
 * instead of silently exiting 0.
 */
export function runMkdocsServe(
  configPath: string,
  host: string,
  port: number,
  open: boolean
): Promise<void> {
  const args = buildServeArgs(configPath, host, port, open);

  const handle = spawnMkdocs(args, { stdin: "inherit" });

  let killedByUs = false;
  const onSigint = () => {
    killedByUs = true;
    handle.kill();
  };
  process.once("SIGINT", onSigint);

  return handle.waitForExit().then((code) => {
    process.off("SIGINT", onSigint);
    // Our own SIGINT-triggered kill() is never a failure — Windows reports a
    // killed shell child's exit code as 1, which would otherwise look
    // indistinguishable from a real crash.
    if (killedByUs) return;
    if (code === 0) return;
    throw new Error(`mkdocs serve exited with code ${code ?? "null"}`);
  });
}

/**
 * Spawn `mkdocs build` and await completion.
 */
export function runMkdocsBuild(
  configPath: string,
  outputDir: string
): Promise<void> {
  const args = [
    "build",
    "-f",
    configPath,
    "-d",
    outputDir,
  ];

  const handle = spawnMkdocs(args, { stdin: "inherit" });

  return handle.waitForExit().then((code) => {
    if (code === 0) {
      console.log(`OK docs build complete — output at ${outputDir}`);
      return;
    }
    throw new Error(`mkdocs build exited with code ${code ?? "null"}`);
  });
}

/**
 * Start `mkdocs serve` in the background (for both-engines mode).
 * Returns a handle with `kill()` and `waitForExit()` so the caller can tear it
 * down and observe the child's liveness.
 *
 * The function does NOT await the child — it starts it and returns immediately
 * so the caller can print the combined banner and await SIGINT. The caller is
 * responsible for consuming `waitForExit()` to detect an immediate crash.
 */
export function startMkdocsServe(
  configPath: string,
  host: string,
  port: number
): MkdocsHandle {
  const args = buildServeArgs(configPath, host, port, false);

  return spawnMkdocs(args, { stdin: "ignore" });
}
