import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { makeTempDir, cleanupTempDir, runCli, exists } from "./helpers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

// ─── Help / Version ───────────────────────────────────────────────────────────

describe("acs --help", () => {
  test("exits 0 and shows usage", () => {
    const r = runCli(["--help"]);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("Usage"), `stdout: ${r.stdout}`);
    assert.ok(r.stdout.includes("init") || r.stdout.includes("install-skills"));
  });

  test("mentions --mode flag", () => {
    const r = runCli(["--help"]);
    assert.ok(r.stdout.includes("--mode"), `stdout: ${r.stdout}`);
  });
});

describe("acs --version", () => {
  test("exits 0 and prints acs <version>", async () => {
    const r = runCli(["--version"]);
    assert.equal(r.status, 0);
    const pkg = JSON.parse(await readFile(join(repoRoot, "src/packages/cli/package.json"), "utf8")) as { version: string };
    assert.ok(r.stdout.includes(`acs ${pkg.version}`), `stdout: ${r.stdout}`);
  });

  test("-v alias also works", async () => {
    const r = runCli(["-v"]);
    assert.equal(r.status, 0);
    const pkg = JSON.parse(await readFile(join(repoRoot, "src/packages/cli/package.json"), "utf8")) as { version: string };
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

// ─── acs init — in-repo (default) ─────────────────────────────────────────────

describe("acs init (default in-repo)", () => {
  let dir: string;
  before(() => { dir = makeTempDir("acs-cli-init-"); });
  after(() => cleanupTempDir(dir));

  test("creates .acs/ layout in project", () => {
    const target = join(dir, "my-store");
    const r = runCli(["init", target]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(target, ".acs")));
    assert.ok(exists(join(target, ".acs/artifacts")));
    assert.ok(exists(join(target, ".acs/handoffs")));
    assert.ok(exists(join(target, ".acs/config.yaml")));
  });

  test("does not create root-level artifacts/ dir", () => {
    const target = join(dir, "my-store");
    assert.ok(!exists(join(target, "artifacts")), "root-level artifacts/ should not exist in in-repo mode");
  });
});

describe("acs init --mode in-repo", () => {
  let dir: string;
  before(() => { dir = makeTempDir("acs-cli-init-inrepo-"); });
  after(() => cleanupTempDir(dir));

  test("creates .acs/ layout", () => {
    const r = runCli(["init", "--mode", "in-repo"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, ".acs")));
    assert.ok(exists(join(dir, ".acs/config.yaml")));
  });
});

// ─── acs init --mode dedicated ────────────────────────────────────────────────

describe("acs init --mode dedicated", () => {
  let dir: string;
  before(() => { dir = makeTempDir("acs-cli-init-dedicated-"); });
  after(() => cleanupTempDir(dir));

  test("creates layout at root level (no .acs/ prefix)", () => {
    const r = runCli(["init", "--mode", "dedicated"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, "config.yaml")));
    assert.ok(exists(join(dir, "artifacts")));
    assert.ok(exists(join(dir, "handoffs")));
    assert.ok(!exists(join(dir, ".acs")), "should not create .acs/ in dedicated mode");
  });
});

// ─── acs init --mode local ────────────────────────────────────────────────────

describe("acs init --mode local", () => {
  let dir: string;
  before(() => { dir = makeTempDir("acs-cli-init-local-"); });
  after(() => cleanupTempDir(dir));

  test("does not create repo-local store files", () => {
    const r = runCli(["init", "--mode", "local"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(!exists(join(dir, ".acs")), ".acs/ should not exist in local mode");
    assert.ok(!exists(join(dir, "artifacts")), "root-level artifacts/ should not exist in local mode");
  });

  test("status resolves local store from registry", () => {
    const r = runCli(["status"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes("local"), `stdout: ${r.stdout}`);
    assert.ok(r.stdout.includes("initialized yes") || r.stdout.includes("initialized true") || r.stdout.includes("initialized  yes"), `stdout: ${r.stdout}`);
  });
});

// ─── acs init unknown mode ────────────────────────────────────────────────────

describe("acs init unknown --mode", () => {
  test("exits non-zero for unknown mode", () => {
    const r = runCli(["init", "--mode", "bogus-mode"]);
    assert.notEqual(r.status, 0);
    assert.ok(r.stdout.includes("Unknown mode") || r.stderr.includes("Unknown mode"));
  });
});

// ─── acs status ───────────────────────────────────────────────────────────────

describe("acs status", () => {
  test("shows not-initialized state for empty dir", () => {
    const dir = makeTempDir("acs-cli-status-empty-");
    const r = runCli(["status"], { cwd: dir });
    cleanupTempDir(dir);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("initialized  no") || r.stdout.includes("initialized no"), `stdout: ${r.stdout}`);
  });

  test("shows initialized state after init", () => {
    const dir = makeTempDir("acs-cli-status-ok-");
    runCli(["init"], { cwd: dir });
    const r = runCli(["status"], { cwd: dir });
    cleanupTempDir(dir);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("initialized  yes") || r.stdout.includes("initialized yes"), `stdout: ${r.stdout}`);
    assert.ok(r.stdout.includes("config      yes") || r.stdout.includes("config yes"), `stdout: ${r.stdout}`);
    assert.ok(r.stdout.includes("schemas     yes") || r.stdout.includes("schemas yes"), `stdout: ${r.stdout}`);
    assert.ok(r.stdout.includes("in-repo"), `stdout: ${r.stdout}`);
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

  test("creates an srs artifact under .acs/", () => {
    const r = runCli(["new", "srs", "--task", "TASK-CLI-01", "--title", "My Requirements"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, ".acs/artifacts/srs/SRS-TASK-CLI-01.md")));
  });

  test("role alias creates an implementation note", () => {
    const r = runCli(["dev", "new", "implementation-note", "--task", "TASK-CLI-IMPL"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, ".acs/artifacts/implementation-note/IMPL-TASK-CLI-IMPL.md")));
  });

  test("canonicalizes api and test aliases", () => {
    const api = runCli(["new", "api", "--task", "TASK-CLI-API"], { cwd: dir });
    assert.equal(api.status, 0, `stderr: ${api.stderr}`);
    assert.ok(exists(join(dir, ".acs/artifacts/api-design/API-TASK-CLI-API.md")));

    const apiDesign = runCli(["sa", "new", "api-design", "--task", "TASK-CLI-API"], { cwd: dir });
    assert.notEqual(apiDesign.status, 0);

    const testPlan = runCli(["new", "test", "--task", "TASK-CLI-TEST"], { cwd: dir });
    assert.equal(testPlan.status, 0, `stderr: ${testPlan.stderr}`);
    assert.ok(exists(join(dir, ".acs/artifacts/test-plan/TEST-TASK-CLI-TEST.md")));
  });

  test("unknown artifact type exits non-zero", () => {
    const r = runCli(["new", "bogus-type", "--task", "TASK-CLI-02"], { cwd: dir });
    assert.notEqual(r.status, 0);
  });

  test("disallowed role exits non-zero", () => {
    const r = runCli(["dev", "new", "srs", "--task", "TASK-CLI-ROLE"], { cwd: dir });
    assert.notEqual(r.status, 0);
    assert.ok(r.stderr.includes("not allowed to create") || r.stdout.includes("not allowed to create"));
  });
});

describe("acs roles, role explain, and next", () => {
  let dir: string;
  before(() => {
    dir = makeTempDir("acs-cli-roles-");
    runCli(["init", dir]);
    runCli(["new", "srs", "--task", "TASK-R01", "--title", "Role SRS"], { cwd: dir });
  });
  after(() => cleanupTempDir(dir));

  test("roles lists configured roles", () => {
    const r = runCli(["roles"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes("ba"));
    assert.ok(r.stdout.includes("dev"));
  });

  test("role explain prints suggested commands", () => {
    const r = runCli(["role", "explain", "dev", "--task", "TASK-R01"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes("implementation-note"));
  });

  test("next prints workflow outputs", () => {
    const r = runCli(["next", "--role", "sa", "--task", "TASK-R01"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes("sdd"));
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

  test("scoped validate checks role, task, and artifact flags", () => {
    const dir = makeTempDir("acs-cli-validate-scope-");
    runCli(["init", dir]);
    runCli(["new", "srs", "--task", "TASK-V01", "--title", "Validate SRS"], { cwd: dir });

    const valid = runCli(["validate", "--role", "ba", "--task", "TASK-V01", "--artifact", ".acs/artifacts/srs/SRS-TASK-V01.md"], { cwd: dir });
    assert.equal(valid.status, 0, `stderr: ${valid.stderr}`);

    const invalid = runCli(["validate", "--role", "fake", "--task", "TASK-MISSING", "--artifact", ".acs/artifacts/missing.md"], { cwd: dir });
    cleanupTempDir(dir);
    assert.notEqual(invalid.status, 0);
    assert.ok(invalid.stdout.includes("Unknown role") || invalid.stderr.includes("Unknown role"));
    assert.ok(invalid.stdout.includes("No artifacts found for task") || invalid.stderr.includes("No artifacts found for task"));
    assert.ok(invalid.stdout.includes("Artifact not found") || invalid.stderr.includes("Artifact not found"));
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

  test("create - creates handoff file under .acs/handoffs/", () => {
    const r = runCli(["handoff", "create", "--from", "sa", "--to", "dev", "--task", "TASK-H01"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, ".acs/handoffs/TASK-H01/HOFF-TASK-H01-SA-DEV.yaml")));
  });

  test("check - exits 0 for existing handoff", () => {
    const r = runCli(["handoff", "check", "HOFF-TASK-H01-SA-DEV"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  test("check - accepts the project-relative path returned by create", () => {
    const r = runCli(["handoff", "check", ".acs/handoffs/TASK-H01/HOFF-TASK-H01-SA-DEV.yaml"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  test("list - lists handoffs for task", () => {
    const r = runCli(["handoff", "list", "--task", "TASK-H01"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes("HOFF-TASK-H01-SA-DEV"));
  });

  test("check - exits non-zero for missing handoff", () => {
    const r = runCli(["handoff", "check", "HOFF-NONEXISTENT"], { cwd: dir });
    assert.notEqual(r.status, 0);
  });

  test("check - policy form enforces required state", () => {
    runCli(["dev", "new", "implementation-note", "--task", "TASK-H02"], { cwd: dir });
    runCli(["dev", "new", "unit-test-note", "--task", "TASK-H02"], { cwd: dir });
    const r = runCli(["handoff", "check", "--from", "dev", "--to", "qa", "--task", "TASK-H02"], { cwd: dir });
    assert.notEqual(r.status, 0);
    assert.ok(r.stdout.includes("ready_for_review") || r.stderr.includes("ready_for_review"));
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

  test("creates markdown package under .acs/packages/", () => {
    const r = runCli(["package", "--task", "TASK-P01", "--role", "dev"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, ".acs/packages/TASK-P01/dev.context.md")));
  });

  test("creates JSON package with --format json", () => {
    const r = runCli(["package", "--task", "TASK-P01", "--role", "dev", "--format", "json"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, ".acs/packages/TASK-P01/dev.context.json")));
  });

  test("role alias package command works", () => {
    const r = runCli(["dev", "package", "--task", "TASK-P01"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, ".acs/packages/TASK-P01/dev.context.md")));
  });

  test("unknown package role exits non-zero", () => {
    const r = runCli(["package", "--task", "TASK-P01", "--role", "totallyfake"], { cwd: dir });
    assert.notEqual(r.status, 0);
    assert.ok(r.stderr.includes("Unknown role") || r.stdout.includes("Unknown role"));
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

  test("rebuilds .acs/index.json", () => {
    const r = runCli(["index"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, ".acs/index.json")));
  });
});
