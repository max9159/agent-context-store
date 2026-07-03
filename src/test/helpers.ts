import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the workspace root. */
export const repoRoot = resolve(__dirname, "../..");

/** Absolute path to the compiled CLI entry point. */
export const cliPath = join(repoRoot, "src", "packages", "cli", "dist", "index.js");

/** Create a uniquely-named temp directory under the OS temp folder. */
export function makeTempDir(prefix = "acs-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Remove a directory created by makeTempDir. */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true });
}

export interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface RunCliOptions {
  /** Working directory for the spawned process. */
  cwd?: string;
  /**
   * Environment variables for the child process.
   * Defaults to inheriting the current process.env.
   * Pass `{ ...process.env, APPDATA: isolated }` to override individual vars
   * without losing the rest of the environment (e.g. PATH, SystemRoot).
   */
  env?: NodeJS.ProcessEnv;
}

/**
 * Run the compiled CLI synchronously and return exit code + captured output.
 * Uses the compiled `src/packages/cli/dist/index.js` so it exercises the real
 * build
 * artifact, not TypeScript source directly.
 */
export function runCli(args: string[], options: RunCliOptions = {}): CliResult {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    env: options.env,    // undefined → spawnSync inherits process.env
    encoding: "utf8",
    timeout: 30_000,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** Read a file as UTF-8 text. */
export async function readText(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

/** Read and JSON-parse a file. */
export async function readJson<T = unknown>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

/** Check whether a file or directory exists. */
export function exists(filePath: string): boolean {
  return existsSync(filePath);
}

/**
 * Create a temp directory, run `fn` with its path, and remove it on completion
 * (even on throw). Useful in async test scenarios that need RAII-style cleanup.
 */
export async function withTempProject<T>(
  prefix: string,
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const dir = makeTempDir(prefix);
  try {
    return await fn(dir);
  } finally {
    await cleanupTempDir(dir);
  }
}

/**
 * Return a process.env copy with APPDATA (Windows) and HOME / XDG_DATA_HOME
 * (macOS/Linux) replaced by paths under `envDir`. This lets local-mode tests
 * write their stores to a throw-away location rather than the real user profile.
 */
export function isolatedEnv(envDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    APPDATA: envDir,
    HOME: envDir,
    USERPROFILE: envDir,
    XDG_DATA_HOME: join(envDir, ".local", "share"),
  };
}

/** Initialize a context store in the given directory. */
export function initStore(dir: string): CliResult {
  return runCli(["init", dir]);
}

/**
 * Build a PATH that omits any directory containing an `mkdocs` binary, but
 * keeps essential system directories so shell invocations still work.
 *
 * On win32 we must keep at minimum:
 *   - The directory containing cmd.exe (typically C:\Windows\System32)
 *   - The directory containing node.exe (so child processes resolve correctly)
 *
 * On POSIX we can keep any directory that does NOT contain a `mkdocs` binary.
 *
 * Shared by cli.spec.ts and integration.spec.ts (previously duplicated).
 */
export function buildMkdocsAbsentPath(): string {
  const sep = platform === "win32" ? ";" : ":";
  const originalDirs = (process.env["PATH"] ?? "").split(sep);

  const filtered = originalDirs.filter((dir) => {
    if (!dir) return false;
    try {
      if (existsSync(join(dir, "mkdocs"))) return false;
      if (existsSync(join(dir, "mkdocs.exe"))) return false;
      if (existsSync(join(dir, "mkdocs.cmd"))) return false;
      if (existsSync(join(dir, "mkdocs.bat"))) return false;
    } catch {
      // If we can't check, keep the dir (conservative)
    }
    return true;
  });

  return filtered.join(sep);
}

/**
 * Detect whether a real `mkdocs` binary is reachable on the current PATH.
 * Used to gate mkdocs-dependent tests (F1/F2/F3 exit-code and process-tree
 * behavior) so they run for real wherever mkdocs is installed but do not
 * fail CI environments where it is not.
 */
export function isMkdocsAvailable(): boolean {
  try {
    const r = spawnSync("mkdocs", ["--version"], {
      shell: platform === "win32",
      stdio: "ignore",
      timeout: 10_000,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}
