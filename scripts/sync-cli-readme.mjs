import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const sourcePath = join(repoRoot, "README.md");
const targetPath = join(repoRoot, "src", "packages", "cli", "README.md");

const header = "<!-- This file is generated from ../../../README.md by scripts/sync-cli-readme.mjs. Do not edit directly. -->\n\n";

const readme = await readFile(sourcePath, "utf8");
await writeFile(targetPath, header + readme, "utf8");

console.log(`Synced ${targetPath}`);
