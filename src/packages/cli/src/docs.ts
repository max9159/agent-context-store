import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

// ─── Docs engine (MkDocs + Material) ─────────────────────────────────────────
//
// This module is imported by index.ts via "./docs.js" (NodeNext ESM — compiled
// extension). Keep imports one-way: docs.ts must NOT import from index.ts.
// Pass any shared values (port, host, storeDir, etc.) as function arguments.

const IS_WIN = process.platform === "win32";

/**
 * When we spawn mkdocs through the shell (win32), Node performs NO argument
 * quoting, so a path containing a space (e.g. C:\Users\John Doe\...) would be
 * split into multiple args and mkdocs would fail. Wrap path-bearing args in
 * double quotes under shell mode. Windows paths cannot contain a double quote,
 * so this is always safe. Under non-shell (POSIX) spawn, arguments are passed
 * verbatim, so no quoting is applied.
 */
function shellQuote(value: string): string {
  return IS_WIN ? `"${value}"` : value;
}

interface MkdocsHandle {
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
  const child = spawn("mkdocs", args, {
    shell: IS_WIN,
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
 * On win32 we spawn through the shell so `mkdocs.exe` is found via PATH/Scripts.
 */
export function mkdocsPreflight(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("mkdocs", ["--version"], {
      shell: IS_WIN,
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
    `site_name: ${siteName}`,
    `docs_dir: ${docsDirPosix}`,
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
 * Spawn `mkdocs serve` (foreground) and forward output with a `[docs]` prefix.
 * Wires SIGINT to kill the child and removes the listener on the child's own
 * exit so no listener leaks (which would otherwise try to kill an already-dead
 * child on a later SIGINT).
 *
 * When `open` is set, `--open` is forwarded to mkdocs so it opens the browser.
 * Returns a Promise that resolves when the child exits.
 */
export function runMkdocsServe(
  configPath: string,
  host: string,
  port: number,
  open: boolean
): Promise<void> {
  const args = [
    "serve",
    "--dev-addr",
    shellQuote(`${host}:${port}`),
    "-f",
    shellQuote(configPath),
  ];
  if (open) args.push("--open");

  const handle = spawnMkdocs(args, { stdin: "inherit" });

  const onSigint = () => {
    handle.kill();
  };
  process.once("SIGINT", onSigint);

  return handle.waitForExit().then(() => {
    process.off("SIGINT", onSigint);
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
    shellQuote(configPath),
    "-d",
    shellQuote(outputDir),
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
): { kill(): void; waitForExit(): Promise<number | null> } {
  const args = [
    "serve",
    "--dev-addr",
    shellQuote(`${host}:${port}`),
    "-f",
    shellQuote(configPath),
  ];

  return spawnMkdocs(args, { stdin: "ignore" });
}
