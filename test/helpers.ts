import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the workspace root. */
export const repoRoot = resolve(__dirname, "..");

/** Absolute path to the compiled CLI entry point. */
export const cliPath = join(repoRoot, "packages", "cli", "dist", "index.js");

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

/**
 * Run the compiled CLI with the given args.
 * @param args - CLI arguments after the entry point.
 * @param options.cwd - Working directory for the spawned process.
 */
export function runCli(args: string[], options: { cwd?: string } = {}): CliResult {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    timeout: 30_000
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

/** Read a file as UTF-8 text. */
export async function readText(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

/** Check whether a file or directory exists. */
export function exists(filePath: string): boolean {
  return existsSync(filePath);
}

/** Initialize a context store in the given directory. */
export function initStore(dir: string): CliResult {
  return runCli(["init", dir]);
}
