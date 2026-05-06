import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { makeTempDir, cleanupTempDir, runCli, exists } from "./helpers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ─── Help / Version ───────────────────────────────────────────────────────────

describe("acs --help", () => {
  test("exits 0 and shows usage", () => {
    const r = runCli(["--help"]);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("Usage"), `stdout: ${r.stdout}`);
    assert.ok(r.stdout.includes("init") || r.stdout.includes("install-skills"));
  });
});

describe("acs --version", () => {
  test("exits 0 and prints acs <version>", async () => {
    const r = runCli(["--version"]);
    assert.equal(r.status, 0);
    const pkg = JSON.parse(await readFile(join(repoRoot, "packages/cli/package.json"), "utf8")) as { version: string };
    assert.ok(r.stdout.includes(`acs ${pkg.version}`), `stdout: ${r.stdout}`);
  });

  test("-v alias also works", async () => {
    const r = runCli(["-v"]);
    assert.equal(r.status, 0);
    const pkg = JSON.parse(await readFile(join(repoRoot, "packages/cli/package.json"), "utf8")) as { version: string };
    assert.ok(r.stdout.includes(`acs ${pkg.version}`));
  });
});

describe("unknown command", () => {
  test("exits non-zero and mentions Unknown command", () => {
    const r = runCli(["foobar-unknown"]);
    assert.notEqual(r.status, 0);
    assert.ok(r.stdout.includes("Unknown") || r.stderr.includes("Unknown"));
  });
});

// ─── acs init ─────────────────────────────────────────────────────────────────

describe("acs init", () => {
  let dir: string;
  before(() => { dir = makeTempDir("acs-cli-init-"); });
  after(() => cleanupTempDir(dir));

  test("creates store layout in the target path", () => {
    const target = join(dir, "my-store");
    const r = runCli(["init", target]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(target, ".context-store")));
    assert.ok(exists(join(target, "artifacts")));
    assert.ok(exists(join(target, "handoffs")));
  });
});

// ─── acs new ──────────────────────────────────────────────────────────────────

describe("acs new", () => {
  let dir: string;
  before(() => {
    dir = makeTempDir("acs-cli-new-");
    runCli(["init", dir]);
  });
  after(() => cleanupTempDir(dir));

  test("creates an srs artifact", () => {
    const r = runCli(["new", "srs", "--task", "TASK-CLI-01", "--title", "My Requirements"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, "artifacts/requirements/REQ-TASK-CLI-01.md")));
  });

  test("unknown artifact type exits non-zero", () => {
    const r = runCli(["new", "bogus-type", "--task", "TASK-CLI-02"], { cwd: dir });
    assert.notEqual(r.status, 0);
  });
});

// ─── acs validate / doctor ────────────────────────────────────────────────────

describe("acs validate", () => {
  test("exits 0 for an initialized store", () => {
    const dir = makeTempDir("acs-cli-validate-ok-");
    runCli(["init", dir]);
    const r = runCli(["validate"], { cwd: dir });
    cleanupTempDir(dir);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  test("exits non-zero for an uninitialized directory", () => {
    const dir = makeTempDir("acs-cli-validate-empty-");
    const r = runCli(["validate"], { cwd: dir });
    cleanupTempDir(dir);
    assert.notEqual(r.status, 0);
  });
});

describe("acs doctor", () => {
  test("mirrors validate - exits 0 for initialized store", () => {
    const dir = makeTempDir("acs-cli-doctor-ok-");
    runCli(["init", dir]);
    const r = runCli(["doctor"], { cwd: dir });
    cleanupTempDir(dir);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });
});

// ─── acs handoff ──────────────────────────────────────────────────────────────

describe("acs handoff", () => {
  let dir: string;
  before(() => {
    dir = makeTempDir("acs-cli-handoff-");
    runCli(["init", dir]);
    runCli(["new", "srs", "--task", "TASK-H01", "--title", "Handoff SRS"], { cwd: dir });
  });
  after(() => cleanupTempDir(dir));

  test("create - creates handoff file", () => {
    const r = runCli(["handoff", "create", "--from", "sa", "--to", "dev", "--task", "TASK-H01"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, "handoffs/HOFF-TASK-H01-SA-DEV.yaml")));
  });

  test("check - exits 0 for existing handoff", () => {
    const r = runCli(["handoff", "check", "HOFF-TASK-H01-SA-DEV"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  test("check - exits non-zero for missing handoff", () => {
    const r = runCli(["handoff", "check", "HOFF-NONEXISTENT"], { cwd: dir });
    assert.notEqual(r.status, 0);
  });
});

// ─── acs package ──────────────────────────────────────────────────────────────

describe("acs package", () => {
  let dir: string;
  before(() => {
    dir = makeTempDir("acs-cli-package-");
    runCli(["init", dir]);
    runCli(["new", "srs", "--task", "TASK-P01", "--title", "Package SRS"], { cwd: dir });
  });
  after(() => cleanupTempDir(dir));

  test("creates markdown package", () => {
    const r = runCli(["package", "--task", "TASK-P01", "--role", "dev"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, "packages/TASK-P01.dev.context.md")));
  });

  test("creates JSON package with --format json", () => {
    const r = runCli(["package", "--task", "TASK-P01", "--role", "dev", "--format", "json"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, "packages/TASK-P01.dev.context.json")));
  });
});

// ─── acs index ────────────────────────────────────────────────────────────────

describe("acs index", () => {
  let dir: string;
  before(() => {
    dir = makeTempDir("acs-cli-index-");
    runCli(["init", dir]);
    runCli(["new", "srs", "--task", "TASK-I01", "--title", "Index SRS"], { cwd: dir });
  });
  after(() => cleanupTempDir(dir));

  test("rebuilds .context-store/index.json", () => {
    const r = runCli(["index"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, ".context-store/index.json")));
  });
});
