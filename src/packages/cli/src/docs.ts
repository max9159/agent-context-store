import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

// ─── Docs engine (MkDocs + Material) ─────────────────────────────────────────
//
// This module is imported by index.ts via "./docs.js" (NodeNext ESM — compiled
// extension). Keep imports one-way: docs.ts must NOT import from index.ts.
// Pass any shared values (port, host, storeDir, etc.) as function arguments.

/**
 * Run `mkdocs --version` to detect if MkDocs is present on PATH.
 * Resolves true on exit-code 0, false for any failure (including ENOENT).
 *
 * On win32 we spawn through the shell so `mkdocs.exe` is found via PATH/Scripts.
 */
export function mkdocsPreflight(): Promise<boolean> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const child = spawn("mkdocs", ["--version"], {
      shell: isWin,
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

/**
 * Handle `acs site docs [flags]`.
 *
 * Flags accepted via tail (string array):
 *   --build-only   Generate and exit; do not start a server.
 *   --port <N>     Port for mkdocs serve (default 8001). Does NOT support 0.
 *   --host <H>     Bind host (default 127.0.0.1).
 *   --open         Open browser after start (handled by mkdocs itself; flag is
 *                  passed through for user info but not used here).
 *
 * Returns a Promise that resolves when the docs engine is done (either
 * --build-only finishes or mkdocs serve exits / SIGINT received).
 */
export async function handleSiteDocs(tail: string[]): Promise<void> {
  const args = parseDocsArgs(tail);
  const port = args.port;
  const host = args.host;
  const buildOnly = args.buildOnly;

  const present = await mkdocsPreflight();
  if (!present) {
    console.log("notice MkDocs not found. Install with:");
    console.log("  pip install mkdocs mkdocs-material");
    console.log("Skipping docs engine.");
    return; // exit 0 — non-fatal
  }

  const cwd = process.cwd();
  // We need the storeDir. Because docs.ts cannot import index.ts, we resolve
  // it locally using a minimal buildSiteModel call — but we don't have that
  // here. Instead, we import from the core directly (allowed; docs.ts only
  // imports from external packages, not from index.ts).
  //
  // Resolve storeDir via a dynamic import of the core package so we avoid a
  // circular dep. This is safe because core has no dep on index.ts.
  const { buildSiteModel } = await import("agent-context-store-core");
  const model = await buildSiteModel(cwd);
  const { storeDir } = model.store;

  const { configPath } = await generateMkdocsWorkspace(storeDir);

  if (buildOnly) {
    const siteOut = path.join(storeDir, "site-docs", "_site");
    await runMkdocsBuild(configPath, siteOut);
    return;
  }

  await runMkdocsServe(configPath, host, port);
}

/**
 * Spawn `mkdocs serve` and forward output with a `[docs]` prefix.
 * Returns a Promise that resolves when the child exits or SIGINT is received.
 */
export function runMkdocsServe(
  configPath: string,
  host: string,
  port: number
): Promise<void> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const child = spawn(
      "mkdocs",
      ["serve", "--dev-addr", `${host}:${port}`, "-f", configPath],
      {
        shell: isWin,
        stdio: ["inherit", "pipe", "pipe"],
      }
    );

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

    child.on("close", (_code) => {
      resolve();
    });

    child.on("error", (err) => {
      console.error(`[docs] error: ${err.message}`);
      resolve();
    });

    // Forward SIGINT to child
    process.once("SIGINT", () => {
      child.kill();
      resolve();
    });
  });
}

/**
 * Spawn `mkdocs build` and await completion.
 */
export function runMkdocsBuild(
  configPath: string,
  outputDir: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === "win32";
    const child = spawn(
      "mkdocs",
      ["build", "-f", configPath, "-d", outputDir],
      {
        shell: isWin,
        stdio: ["inherit", "pipe", "pipe"],
      }
    );

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

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`OK docs build complete — output at ${outputDir}`);
        resolve();
      } else {
        reject(new Error(`mkdocs build exited with code ${code ?? "null"}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Start mkdocs serve in the background (for both-engines mode).
 * Returns a handle with a kill() function so the caller can tear it down.
 *
 * The function does NOT await the child — it starts it and returns immediately
 * so the caller can print the combined banner and await SIGINT.
 */
export function startMkdocsServe(
  configPath: string,
  host: string,
  port: number
): { kill(): void; waitForExit(): Promise<number | null> } {
  const isWin = process.platform === "win32";
  const child = spawn(
    "mkdocs",
    ["serve", "--dev-addr", `${host}:${port}`, "-f", configPath],
    {
      shell: isWin,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

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

  child.on("error", (err) => {
    console.error(`[docs] error: ${err.message}`);
  });

  const exitPromise: Promise<number | null> = new Promise((resolve) => {
    child.on("close", (code) => {
      if (code !== null && code !== 0) {
        console.error(`[docs] mkdocs exited with code ${code}`);
      }
      resolve(code);
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

// ─── Internal arg parser for docs flags ──────────────────────────────────────

interface DocsArgs {
  buildOnly: boolean;
  port: number;
  host: string;
}

function parseDocsArgs(args: string[]): DocsArgs {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const name = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      flags[name] = true;
    } else {
      flags[name] = next;
      i++;
    }
  }

  return {
    buildOnly: flags["build-only"] === true || flags["build-only"] === "true",
    port: parsePortValue(flags["port"], 8001),
    host: typeof flags["host"] === "string" ? flags["host"] : "127.0.0.1",
  };
}

function parsePortValue(
  value: string | boolean | undefined,
  fallback: number
): number {
  if (value === undefined || value === true) return fallback;
  const str = String(value);
  const n = Number.parseInt(str, 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535 || String(n) !== str) {
    throw new Error(
      `--port must be an integer between 1 and 65535, got "${str}"`
    );
  }
  return n;
}

