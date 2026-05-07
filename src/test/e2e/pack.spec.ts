/**
 * End-to-end pack smoke test
 *
 * This test simulates what a real npm user experiences:
 *
 *   1. `pnpm pack` the core library → produce agent-context-store-core-x.y.z.tgz
 *   2. `pnpm pack` the CLI          → produce agent-context-store-x.y.z.tgz
 *   3. `npm install` both tarballs into a throw-away directory
 *   4. Run the installed `acs` binary (via Node directly, cross-platform safe)
 *   5. Assert CLI version, help output, and a real init round-trip
 *
 * Why a separate e2e directory?
 * ─────────────────────────────
 * This test is intentionally excluded from `pnpm test` because:
 *   • It runs `npm install` which takes 10-30 s and requires npm to be on PATH.
 *   • It validates the published npm artifact, not the workspace source.
 *
 * Run it explicitly with:
 *   pnpm test:e2e
 *
 * Prerequisites: run `pnpm build` first (the test:e2e script does this).
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync }  from "node:child_process";
import { writeFile }  from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeTempDir, cleanupTempDir, exists } from "../helpers.ts";

const __dirname   = dirname(fileURLToPath(import.meta.url));
const repoRoot    = resolve(__dirname, "../../..");
const coreDir     = join(repoRoot, "src", "packages", "core");
const cliDir      = join(repoRoot, "src", "packages", "cli");

/** Run a shell command synchronously; throws on non-zero exit. */
function run(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeout?: number }
): { stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    encoding: "utf8",
    timeout: opts.timeout ?? 60_000,
    shell: true,   // needed on Windows for npm/pnpm .cmd wrappers
  });
  if (r.status !== 0) {
    throw new Error(
      `Command \`${cmd} ${args.join(" ")}\` failed (exit ${r.status}):\n${r.stderr || r.stdout}`,
    );
  }
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

describe("npm pack smoke — install from tarball and run the real CLI", () => {
  let packDir: string;
  let installDir: string;

  /** Absolute path to the installed CLI entry point after `npm install`. */
  let installedCli: string;

  before(async () => {
    packDir    = makeTempDir("acs-pack-");
    installDir = makeTempDir("acs-install-");

    // ── 1. Pack core ──────────────────────────────────────────────────────
    // pnpm pack --json returns a single object { name, version, filename, files[] }
    // where `filename` is already the full absolute path to the produced tarball.
    const coreOut = run("pnpm", ["pack", "--json", "--pack-destination", packDir], {
      cwd: coreDir,
    });
    const coreInfo = JSON.parse(coreOut.stdout) as { filename: string };
    const coreTarball = coreInfo.filename;

    // ── 2. Pack CLI ───────────────────────────────────────────────────────
    const cliOut = run("pnpm", ["pack", "--json", "--pack-destination", packDir], {
      cwd: cliDir,
    });
    const cliInfo = JSON.parse(cliOut.stdout) as { filename: string };
    const cliTarball = cliInfo.filename;

    // ── 3. Create minimal npm project in installDir ───────────────────────
    //     type: "module" matches the CLI package so ESM resolution works.
    await writeFile(
      join(installDir, "package.json"),
      JSON.stringify({ name: "acs-pack-test", version: "1.0.0", type: "module" }),
    );

    // ── 4. npm install both tarballs together ─────────────────────────────
    //     Installing core first ensures the CLI's peer dep resolves locally.
    run("npm", ["install", "--no-save", coreTarball, cliTarball], {
      cwd: installDir,
      timeout: 120_000,
    });

    // The CLI package name is "agent-context-store"
    installedCli = join(installDir, "node_modules", "agent-context-store", "dist", "index.js");
  });

  after(async () => {
    await Promise.all([cleanupTempDir(packDir), cleanupTempDir(installDir)]);
  });

  // ─── Assertions ───────────────────────────────────────────────────────────

  test("dist/index.js is present inside the installed package", () => {
    assert.ok(exists(installedCli), `expected CLI at ${installedCli}`);
  });

  test("installed acs --help exits 0 and includes Usage block with init and role commands", () => {
    const r = spawnSync(process.execPath, [installedCli, "--help"], { encoding: "utf8" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes("Usage"),    `stdout: ${r.stdout}`);
    assert.ok(r.stdout.includes("acs init"), `stdout: ${r.stdout}`);
    assert.ok(r.stdout.includes("acs roles"),`stdout: ${r.stdout}`);
    // Role-aware commands must be present in help (ACS Role CLI plan feature)
    assert.ok(
      r.stdout.includes("role explain") || r.stdout.includes("ROLE"),
      `role commands missing from help: ${r.stdout}`,
    );
  });

  test("installed acs --version exits 0 and reports the CLI version string", () => {
    const r = spawnSync(process.execPath, [installedCli, "--version"], { encoding: "utf8" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.startsWith("acs "), `stdout: ${r.stdout}`);
  });

  test("installed acs init creates .acs/ layout with policy assets", async () => {
    const projectDir = makeTempDir("acs-pack-project-");
    try {
      const r = spawnSync(process.execPath, [installedCli, "init"], {
        cwd: projectDir,
        encoding: "utf8",
        timeout: 30_000,
      });
      assert.equal(r.status, 0, `installed init failed: ${r.stderr}`);

      // Core layout
      assert.ok(exists(join(projectDir, ".acs/config.yaml")),         ".acs/config.yaml");
      assert.ok(exists(join(projectDir, ".acs/acs.yaml")),            ".acs/acs.yaml (workflow policy)");
      assert.ok(exists(join(projectDir, ".acs/artifacts")),           ".acs/artifacts/");
      assert.ok(exists(join(projectDir, ".acs/handoffs")),            ".acs/handoffs/");

      // Policy assets (ACS Role CLI plan — bundled and seed-copied)
      assert.ok(exists(join(projectDir, ".acs/roles/ba.yaml")),               "roles/ba.yaml");
      assert.ok(exists(join(projectDir, ".acs/roles/dev.yaml")),              "roles/dev.yaml");
      assert.ok(exists(join(projectDir, ".acs/artifact-types/srs.yaml")),     "artifact-types/srs.yaml");
      assert.ok(exists(join(projectDir, ".acs/artifact-types/api-design.yaml")), "artifact-types/api-design.yaml");
      assert.ok(exists(join(projectDir, ".acs/workflows/default-sdlc.yaml")), "workflows/default-sdlc.yaml");
      assert.ok(exists(join(projectDir, ".acs/templates/srs.md")),            "templates/srs.md");
      assert.ok(exists(join(projectDir, ".acs/schemas/artifact.schema.json")),"schemas/artifact.schema.json");
    } finally {
      await cleanupTempDir(projectDir);
    }
  });

  test("installed acs roles exits 0 and lists ba, sa, dev, qa", async () => {
    const projectDir = makeTempDir("acs-pack-roles-");
    try {
      spawnSync(process.execPath, [installedCli, "init"], {
        cwd: projectDir, encoding: "utf8", timeout: 30_000,
      });
      const r = spawnSync(process.execPath, [installedCli, "roles"], {
        cwd: projectDir, encoding: "utf8", timeout: 10_000,
      });
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      for (const role of ["ba", "sa", "dev", "qa"]) {
        assert.ok(r.stdout.includes(role), `roles output missing: ${role}\n${r.stdout}`);
      }
    } finally {
      await cleanupTempDir(projectDir);
    }
  });

  test("installed acs new srs creates artifact without source-tree assets", async () => {
    const projectDir = makeTempDir("acs-pack-new-");
    try {
      spawnSync(process.execPath, [installedCli, "init"], {
        cwd: projectDir, encoding: "utf8", timeout: 30_000,
      });
      const r = spawnSync(process.execPath, [installedCli, "new", "srs", "--task", "PACK-001"], {
        cwd: projectDir, encoding: "utf8", timeout: 10_000,
      });
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.ok(exists(join(projectDir, ".acs/artifacts/srs/SRS-PACK-001.md")));
    } finally {
      await cleanupTempDir(projectDir);
    }
  });
});
