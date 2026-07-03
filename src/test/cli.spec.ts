import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { makeTempDir, cleanupTempDir, runCli, exists, readText, cliPath, withTempProject, buildMkdocsAbsentPath } from "./helpers.ts";
import { buildRendererJs, formatHostForUrl } from "../packages/cli/dist/index.js";
import { generateMkdocsWorkspace } from "../packages/cli/dist/docs.js";

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

  test("mentions link command", () => {
    const r = runCli(["--help"]);
    assert.ok(r.stdout.includes("acs link <existing_store_path>"), `stdout: ${r.stdout}`);
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

// ─── acs link ────────────────────────────────────────────────────────────────

describe("acs link", () => {
  let projectDir: string;
  let storeDir: string;
  before(() => {
    projectDir = makeTempDir("acs-cli-link-project-");
    storeDir = makeTempDir("acs-cli-link-store-");
  });
  after(async () => { await cleanupTempDir(projectDir); await cleanupTempDir(storeDir); });

  test("creates only a project pointer to an existing ACS store", async () => {
    await writeFile(join(storeDir, "config.yaml"), "version: 1\ntoolkit: agent-context-store\ncli: acs\nmode: dedicated\n", "utf8");

    const r = runCli(["link", storeDir], { cwd: projectDir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const pointerPath = join(projectDir, ".acs", "config.yaml");
    assert.ok(exists(pointerPath), ".acs/config.yaml should exist");
    const pointer = await readText(pointerPath);
    assert.match(pointer, /mode: dedicated/);
    assert.match(pointer, /store_path:/);
    assert.ok(pointer.includes(storeDir.replaceAll("\\", "/")), pointer);

    assert.deepEqual((await readdir(storeDir)).sort(), ["config.yaml"], "link must not create files in the existing store");
  });

  test("status resolves through the linked store path", async () => {
    const r = runCli(["status"], { cwd: projectDir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes("mode        dedicated"), `stdout: ${r.stdout}`);
    assert.ok(r.stdout.includes(storeDir), `stdout: ${r.stdout}`);
    assert.ok(r.stdout.includes("initialized yes") || r.stdout.includes("initialized  yes"), `stdout: ${r.stdout}`);
  });

  test("preserves a non-dedicated target config mode in the pointer", async () => {
    const localProject = makeTempDir("acs-cli-link-local-project-");
    const localStore = makeTempDir("acs-cli-link-local-store-");
    try {
      await writeFile(join(localStore, "config.yaml"), "version: 1\ntoolkit: agent-context-store\ncli: acs\nmode: in-repo\n", "utf8");
      const r = runCli(["link", localStore], { cwd: localProject });
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const pointer = await readText(join(localProject, ".acs", "config.yaml"));
      assert.match(pointer, /mode: in-repo/);

      const status = runCli(["status"], { cwd: localProject });
      assert.equal(status.status, 0, `stderr: ${status.stderr}`);
      assert.ok(status.stdout.includes("mode        in-repo"), `stdout: ${status.stdout}`);
      assert.ok(status.stdout.includes(localStore), `stdout: ${status.stdout}`);
    } finally {
      await cleanupTempDir(localProject);
      await cleanupTempDir(localStore);
    }
  });

  test("supports --path to link a project outside cwd", async () => {
    const cwd = makeTempDir("acs-cli-link-cwd-");
    const pathProject = makeTempDir("acs-cli-link-path-project-");
    const pathStore = makeTempDir("acs-cli-link-path-store-");
    try {
      await writeFile(join(pathStore, "config.yaml"), "version: 1\ntoolkit: agent-context-store\ncli: acs\nmode: dedicated\n", "utf8");
      const r = runCli(["link", pathStore, "--path", pathProject], { cwd });
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      assert.ok(exists(join(pathProject, ".acs", "config.yaml")));
      assert.ok(!exists(join(cwd, ".acs", "config.yaml")));
    } finally {
      await cleanupTempDir(cwd);
      await cleanupTempDir(pathProject);
      await cleanupTempDir(pathStore);
    }
  });

  test("fails for a target without ACS identity config", async () => {
    const badProject = makeTempDir("acs-cli-link-bad-project-");
    const badStore = makeTempDir("acs-cli-link-bad-store-");
    try {
      const r = runCli(["link", badStore], { cwd: badProject });
      assert.notEqual(r.status, 0);
      assert.ok(!exists(join(badProject, ".acs", "config.yaml")), "failed link must not write project pointer");
    } finally {
      await cleanupTempDir(badProject);
      await cleanupTempDir(badStore);
    }
  });

  test("requires --force to replace a different existing pointer", async () => {
    const forceProject = makeTempDir("acs-cli-link-force-project-");
    const firstStore = makeTempDir("acs-cli-link-force-store-a-");
    const secondStore = makeTempDir("acs-cli-link-force-store-b-");
    try {
      const config = "version: 1\ntoolkit: agent-context-store\ncli: acs\nmode: dedicated\n";
      await writeFile(join(firstStore, "config.yaml"), config, "utf8");
      await writeFile(join(secondStore, "config.yaml"), config, "utf8");

      assert.equal(runCli(["link", firstStore], { cwd: forceProject }).status, 0);
      const blocked = runCli(["link", secondStore], { cwd: forceProject });
      assert.notEqual(blocked.status, 0);
      assert.ok((await readText(join(forceProject, ".acs", "config.yaml"))).includes(firstStore.replaceAll("\\", "/")));

      const replaced = runCli(["link", secondStore, "--force"], { cwd: forceProject });
      assert.equal(replaced.status, 0, `stderr: ${replaced.stderr}`);
      assert.ok((await readText(join(forceProject, ".acs", "config.yaml"))).includes(secondStore.replaceAll("\\", "/")));
    } finally {
      await cleanupTempDir(forceProject);
      await cleanupTempDir(firstStore);
      await cleanupTempDir(secondStore);
    }
  });

  test("fails for a non-existent store path", () => {
    const nonExistentStore = join(projectDir, "does-not-exist-store");
    const r = runCli(["link", nonExistentStore], { cwd: projectDir });
    assert.notEqual(r.status, 0);
    assert.ok(
      r.stdout.includes("does not exist") || r.stderr.includes("does not exist"),
      `expected "does not exist" in output; stdout: ${r.stdout} stderr: ${r.stderr}`
    );
  });

  test("fails for a non-existent project path via --path", () => {
    const nonExistentProject = join(projectDir, "does-not-exist-project");
    const r = runCli(["link", storeDir, "--path", nonExistentProject], { cwd: projectDir });
    assert.notEqual(r.status, 0);
    assert.ok(
      r.stdout.includes("does not exist") || r.stderr.includes("does not exist"),
      `expected "does not exist" in output; stdout: ${r.stdout} stderr: ${r.stderr}`
    );
  });

  test("fails when store path is a file, not a directory", async () => {
    const filePath = join(projectDir, "a-regular-file.txt");
    await writeFile(filePath, "not a directory", "utf8");
    const r = runCli(["link", filePath], { cwd: projectDir });
    assert.notEqual(r.status, 0);
    assert.ok(
      r.stdout.includes("not a directory") || r.stderr.includes("not a directory"),
      `expected "not a directory" in output; stdout: ${r.stdout} stderr: ${r.stderr}`
    );
  });

  test("no-op when pointer already matches the same store succeeds without changes", async () => {
    const noopProject = makeTempDir("acs-cli-link-noop-project-");
    const noopStore = makeTempDir("acs-cli-link-noop-store-");
    try {
      await writeFile(join(noopStore, "config.yaml"), "version: 1\ntoolkit: agent-context-store\ncli: acs\nmode: dedicated\n", "utf8");

      const first = runCli(["link", noopStore], { cwd: noopProject });
      assert.equal(first.status, 0, `first link failed: ${first.stderr}`);
      assert.ok(first.stdout.includes("created"), `expected "created" in stdout: ${first.stdout}`);

      const second = runCli(["link", noopStore], { cwd: noopProject });
      assert.equal(second.status, 0, `second link (no-op) failed: ${second.stderr}`);
      assert.ok(!second.stdout.includes("created") && !second.stdout.includes("updated"),
        `no-op should not report created/updated; stdout: ${second.stdout}`);
    } finally {
      await cleanupTempDir(noopProject);
      await cleanupTempDir(noopStore);
    }
  });

  test("exits 0 with warning lines when linked store is missing acs.yaml or schemas", async () => {
    const warnProject = makeTempDir("acs-cli-link-warn-project-");
    const warnStore = makeTempDir("acs-cli-link-warn-store-");
    try {
      await writeFile(join(warnStore, "config.yaml"), "version: 1\ntoolkit: agent-context-store\ncli: acs\nmode: dedicated\n", "utf8");
      const r = runCli(["link", warnStore], { cwd: warnProject });
      assert.equal(r.status, 0, `expected exit 0 with warnings; stderr: ${r.stderr}`);
      const combined = r.stdout + r.stderr;
      assert.ok(combined.includes("warning"), `expected at least one warning line; output: ${combined}`);
    } finally {
      await cleanupTempDir(warnProject);
      await cleanupTempDir(warnStore);
    }
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

// ─── acs init --mode dedicated <storePath> from a project dir ─────────────────

describe("acs init --mode dedicated with separate project dir", () => {
  let projectDir: string;
  let storeDir: string;
  before(() => {
    projectDir = makeTempDir("acs-cli-init-ded-proj-");
    storeDir = makeTempDir("acs-cli-init-ded-store-");
  });
  after(() => { cleanupTempDir(projectDir); cleanupTempDir(storeDir); });

  test("writes .acs/config.yaml pointer in the project dir", () => {
    const r = runCli(["init", "--mode", "dedicated", storeDir], { cwd: projectDir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(projectDir, ".acs", "config.yaml")), ".acs/config.yaml should exist in project dir");
  });

  test("acs status from project dir shows dedicated mode and initialized", () => {
    const s = runCli(["status"], { cwd: projectDir });
    assert.equal(s.status, 0, `stderr: ${s.stderr}`);
    assert.ok(s.stdout.includes("dedicated"), `expected dedicated in status output, got:\n${s.stdout}`);
    assert.ok(s.stdout.includes("initialized  yes") || s.stdout.includes("initialized yes"), `expected initialized yes, got:\n${s.stdout}`);
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
    assert.ok(exists(join(dir, ".acs/artifacts/TASK-CLI-01/srs/SRS-TASK-CLI-01.md")));
  });

  test("role alias creates an implementation note", () => {
    const r = runCli(["dev", "new", "implementation-note", "--task", "TASK-CLI-IMPL"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, ".acs/artifacts/TASK-CLI-IMPL/implementation-note/IMPL-TASK-CLI-IMPL.md")));
  });

  test("canonicalizes api and test aliases", () => {
    const api = runCli(["new", "api", "--task", "TASK-CLI-API"], { cwd: dir });
    assert.equal(api.status, 0, `stderr: ${api.stderr}`);
    assert.ok(exists(join(dir, ".acs/artifacts/TASK-CLI-API/api-design/API-TASK-CLI-API.md")));

    const apiDesign = runCli(["sa", "new", "api-design", "--task", "TASK-CLI-API"], { cwd: dir });
    assert.notEqual(apiDesign.status, 0);

    const testPlan = runCli(["new", "test", "--task", "TASK-CLI-TEST"], { cwd: dir });
    assert.equal(testPlan.status, 0, `stderr: ${testPlan.stderr}`);
    assert.ok(exists(join(dir, ".acs/artifacts/TASK-CLI-TEST/test-plan/TEST-TASK-CLI-TEST.md")));
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

describe("acs package context budget", () => {
  let dir: string;
  before(() => {
    dir = makeTempDir("acs-cli-package-budget-");
    runCli(["init", dir]);
    runCli(["new", "srs", "--task", "TASK-PKG-BUDGET", "--title", "Budget SRS"], { cwd: dir });
  });
  after(() => cleanupTempDir(dir));

  test("json package includes context budget advisory and non-ok risk exits 0", async () => {
    const r = runCli(["package", "--role", "dev", "--task", "TASK-PKG-BUDGET", "--format", "json", "--max-tokens", "40"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes("context budget"), `stdout: ${r.stdout}`);
    const pkg = JSON.parse(await readFile(join(dir, ".acs/packages/TASK-PKG-BUDGET/dev.context.json"), "utf8"));
    assert.equal(pkg.context_budget.max_tokens, 40);
    assert.equal(pkg.context_budget.risk, "split_recommended");
  });

  test("markdown package includes a context budget section", async () => {
    const r = runCli(["package", "--role", "dev", "--task", "TASK-PKG-BUDGET", "--max-tokens", "200000"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const content = await readFile(join(dir, ".acs/packages/TASK-PKG-BUDGET/dev.context.md"), "utf8");
    assert.ok(content.includes("## Context Budget"));
    assert.ok(content.includes("risk"));
  });

  test("invalid --max-tokens exits non-zero", () => {
    const r = runCli(["package", "--role", "dev", "--task", "TASK-PKG-BUDGET", "--max-tokens", "not-a-number"], { cwd: dir });
    assert.notEqual(r.status, 0);
    assert.ok((r.stderr + r.stdout).includes("max-tokens"));
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

    const valid = runCli(["validate", "--role", "ba", "--task", "TASK-V01", "--artifact", ".acs/artifacts/TASK-V01/srs/SRS-TASK-V01.md"], { cwd: dir });
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

// ─── acs site kanban (build-only) — Test Plan tests #1-#8 ────────────────────

describe("acs site kanban --build-only", () => {
  let dir: string;

  before(() => {
    dir = makeTempDir("acs-cli-site-");
    runCli(["init", dir]);
    runCli(["new", "srs", "--task", "SITE-001", "--title", "Site SRS"], { cwd: dir });
    runCli(["new", "srs", "--task", "SITE-002", "--title", "Other SRS"], { cwd: dir });
  });
  after(() => cleanupTempDir(dir));

  // Test #1 — build-only parity
  test("creates site/index.html, data/model.json, assets/site.css, assets/site.js; exits 0", () => {
    const r = runCli(["site", "kanban", "--build-only"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr} stdout: ${r.stdout}`);
    assert.ok(exists(join(dir, ".acs/site/index.html")), "site/index.html should exist");
    assert.ok(exists(join(dir, ".acs/site/data/model.json")), "site/data/model.json should exist");
    assert.ok(exists(join(dir, ".acs/site/assets/site.css")), "site/assets/site.css should exist");
    assert.ok(exists(join(dir, ".acs/site/assets/site.js")), "site/assets/site.js should exist");
  });

  // Test #2 — build-only --task filter
  test("--task flag filters model.json tasks and artifacts", async () => {
    const r = runCli(["site", "kanban", "--build-only", "--task", "SITE-001"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const content = await readFile(join(dir, ".acs/site/data/model.json"), "utf8");
    const model = JSON.parse(content);
    const taskIds = model.tasks.map((t: { taskId: string }) => t.taskId);
    assert.ok(taskIds.includes("SITE-001"), "model.tasks should include SITE-001");
    assert.ok(!taskIds.includes("SITE-002"), "model.tasks should not include SITE-002 when filtered");
    const artifactTaskIds = new Set(model.artifacts.map((a: { taskId: string }) => a.taskId));
    assert.ok(!artifactTaskIds.has("SITE-002"), "model.artifacts should not include SITE-002 when filtered");
  });

  // Test #3 — build-only reports paths
  test("output reports generated file paths", () => {
    const r = runCli(["site", "kanban", "--build-only"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(
      r.stdout.includes("index.html") || r.stdout.includes("model.json"),
      `expected path in output; stdout: ${r.stdout}`
    );
  });

  // Test #4 — build-only nonexistent task
  test("--task with a nonexistent task prints a notice and exits 0", () => {
    const r = runCli(["site", "kanban", "--build-only", "--task", "TASK-DOES-NOT-EXIST"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(
      r.stdout.includes("notice") || r.stdout.includes("no artifacts"),
      `expected notice in stdout: ${r.stdout}`
    );
  });

  // Test #5 — removed 'build' exits non-zero
  test("acs site build exits non-zero and message names acs site kanban --build-only", () => {
    const r = runCli(["site", "build"], { cwd: dir });
    assert.notEqual(r.status, 0, "acs site build must exit non-zero");
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes("kanban --build-only") || combined.includes("kanban"),
      `message should reference kanban --build-only; output: ${combined}`
    );
  });

  // Test #6 — help mentions acs site kanban and acs site docs, NOT site build as current
  test("--help mentions acs site kanban and acs site docs", () => {
    const r = runCli(["--help"]);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("site kanban"), `expected "site kanban" in help; stdout: ${r.stdout}`);
    assert.ok(r.stdout.includes("site docs"), `expected "site docs" in help; stdout: ${r.stdout}`);
    // The old 'acs site build [--task]' usage line should be gone
    assert.ok(
      !r.stdout.includes("acs site build [--task"),
      `help should NOT show the old "acs site build [--task...]" usage; stdout: ${r.stdout}`
    );
  });

  // Test #7 — live-reload tail present in site.js
  test("site.js contains __livereload and file: guard after build-only", async () => {
    runCli(["site", "kanban", "--build-only"], { cwd: dir });
    const jsContent = await readFile(join(dir, ".acs/site/assets/site.js"), "utf8");
    assert.ok(
      jsContent.includes("__livereload"),
      `site.js should contain __livereload; got: ${jsContent.slice(0, 200)}`
    );
    assert.ok(
      jsContent.includes("file:"),
      `site.js should contain the file: guard; got: ${jsContent.slice(-300)}`
    );
  });
});

// Test #8 — docs preflight absent (PATH stub)
describe("acs site docs (mkdocs absent)", () => {
  let dir: string;

  before(() => {
    dir = makeTempDir("acs-cli-site-docs-");
    runCli(["init", dir]);
    runCli(["new", "srs", "--task", "DOCS-001", "--title", "Docs SRS"], { cwd: dir });
  });
  after(() => cleanupTempDir(dir));

  test("exits 0 and prints pip install hint when mkdocs is not on PATH", () => {
    // Build a PATH that omits any directory containing mkdocs but keeps system
    // dirs so that the shell/Node can still run (especially on win32 where
    // cmd.exe is needed for the shell: true spawn).
    const stubPath = buildMkdocsAbsentPath();

    const r = runCli(["site", "docs"], {
      cwd: dir,
      env: { ...process.env, PATH: stubPath },
    });
    assert.equal(r.status, 0, `expected exit 0; stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes("pip install mkdocs"),
      `expected pip install hint; output: ${combined}`
    );
  });
});

// ─── existing commands unaffected after site kanban --build-only ──────────────

describe("existing commands unaffected by site kanban build-only", () => {
  let dir: string;

  before(() => {
    dir = makeTempDir("acs-cli-site-compat-");
    runCli(["init", dir]);
    runCli(["new", "srs", "--task", "COMPAT-001", "--title", "Compat SRS"], { cwd: dir });
    runCli(["site", "kanban", "--build-only"], { cwd: dir });
  });
  after(() => cleanupTempDir(dir));

  test("acs index works after site kanban build-only", () => {
    const r = runCli(["index"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  test("acs validate works after site kanban build-only", () => {
    const r = runCli(["validate"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  test("acs status works after site kanban build-only", () => {
    const r = runCli(["status"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  test("site/ directory is not scanned by acs index", async () => {
    const r = runCli(["index"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const indexContent = await readFile(join(dir, ".acs/index.json"), "utf8");
    const index = JSON.parse(indexContent);
    for (const artifact of index.artifacts) {
      assert.ok(
        !(artifact.path as string).includes("site/"),
        `index should not include site/ artifact: ${artifact.path as string}`
      );
    }
  });
});

// ─── B1: port-in-use exits non-zero promptly (does NOT hang) ─────────────────

describe("acs site kanban port-in-use exits non-zero", () => {
  let dir: string;
  let occupiedPort: number;
  let sentinel: net.Server;

  before(async () => {
    dir = makeTempDir("acs-cli-site-port-");
    runCli(["init", dir]);
    runCli(["new", "srs", "--task", "PORT-001", "--title", "Port SRS"], { cwd: dir });
    runCli(["site", "kanban", "--build-only"], { cwd: dir });

    // Occupy a port so the CLI will hit EADDRINUSE
    occupiedPort = await new Promise<number>((resolve) => {
      sentinel = net.createServer();
      sentinel.listen(0, "127.0.0.1", () => {
        const addr = sentinel.address();
        resolve(typeof addr === "object" && addr !== null ? addr.port : 0);
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => { sentinel.close(() => resolve()); });
    await cleanupTempDir(dir);
  });

  test("exits non-zero with port-in-use message, does not hang", async () => {
    // Spawn asynchronously with a fixed timeout so we can assert it does not hang.
    const result = await new Promise<{ status: number; output: string }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [cliPath, "site", "kanban", "--port", String(occupiedPort), "--no-watch"],
        { cwd: dir, stdio: ["ignore", "pipe", "pipe"] }
      );
      let output = "";
      if (child.stdout) child.stdout.on("data", (c: Buffer) => { output += String(c); });
      if (child.stderr) child.stderr.on("data", (c: Buffer) => { output += String(c); });

      // Must exit within 8 seconds — a hang would time out and fail the test
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Process did not exit within 8s (port-in-use should be immediate).\nOutput: ${output}`));
      }, 8000);

      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve({ status: code ?? 1, output });
      });
    });

    assert.notEqual(result.status, 0, `expected non-zero exit; output: ${result.output}`);
    assert.ok(
      result.output.includes("in use") || result.output.includes("EADDRINUSE"),
      `expected port-in-use message; output: ${result.output}`
    );
  });
});

// ─── S1: generateMkdocsWorkspace unit test (no MkDocs needed) ────────────────

describe("generateMkdocsWorkspace writes only site-docs/, leaves artifacts/ pristine", () => {
  let storeDir: string;

  before(async () => {
    storeDir = makeTempDir("acs-cli-mkdocs-ws-");
    // Create a minimal artifacts/ dir to simulate a real store
    const artifactsDir = join(storeDir, "artifacts");
    const { mkdir: mkdirAsync } = await import("node:fs/promises");
    await mkdirAsync(join(artifactsDir, "TASK-001", "srs"), { recursive: true });
    await writeFile(join(artifactsDir, "TASK-001", "srs", "SRS-TASK-001.md"), "# SRS\n", "utf8");
  });

  after(() => cleanupTempDir(storeDir));

  test("site-docs/mkdocs.yml is created", async () => {
    await generateMkdocsWorkspace(storeDir);
    assert.ok(
      existsSync(join(storeDir, "site-docs", "mkdocs.yml")),
      "site-docs/mkdocs.yml should exist"
    );
  });

  test("mkdocs.yml points docs_dir at artifacts/", async () => {
    const content = await readFile(join(storeDir, "site-docs", "mkdocs.yml"), "utf8");
    assert.ok(content.includes("artifacts"), `mkdocs.yml should reference artifacts/; got: ${content}`);
    assert.ok(!content.includes("index.md"), `mkdocs.yml must not reference a generated index.md; got: ${content}`);
  });

  test("artifacts/ directory is unchanged — no new files added", async () => {
    const entries = await readdir(join(storeDir, "artifacts", "TASK-001", "srs"));
    assert.deepEqual(entries, ["SRS-TASK-001.md"], "artifacts/ should contain only the original file");
  });

  test("no index.md was written inside artifacts/", () => {
    assert.ok(
      !existsSync(join(storeDir, "artifacts", "index.md")),
      "artifacts/index.md must not be created by generateMkdocsWorkspace"
    );
  });
});

// ─── Finding F6: docs_dir / site_name are quoted YAML scalars ────────────────
//
// An unquoted plain scalar containing " #" (legal in a Windows/POSIX path
// segment, e.g. "D:\repos\proj #1\") is truncated at the comment marker by
// any YAML parser, including MkDocs's. Both values must be emitted as
// double-quoted scalars so the full path round-trips.

describe("generateMkdocsWorkspace quotes docs_dir/site_name for paths containing ' #' (F6)", () => {
  let parentDir: string;
  let storeDir: string;

  before(async () => {
    parentDir = makeTempDir("acs-cli-mkdocs-hash-");
    storeDir = join(parentDir, "proj #1");
    const { mkdir: mkdirAsync } = await import("node:fs/promises");
    await mkdirAsync(join(storeDir, "artifacts"), { recursive: true });
  });

  after(() => cleanupTempDir(parentDir));

  test("docs_dir is double-quoted and round-trips the full ' #' path segment", async () => {
    await generateMkdocsWorkspace(storeDir);
    const content = await readFile(join(storeDir, "site-docs", "mkdocs.yml"), "utf8");
    const docsDirLine = content.split("\n").find((line) => line.startsWith("docs_dir:"));
    assert.ok(docsDirLine, `expected a docs_dir line; got: ${content}`);
    assert.ok(
      docsDirLine!.includes("proj #1"),
      `docs_dir must include the full "proj #1" segment, not be truncated at the comment marker; got: ${docsDirLine}`
    );
    assert.ok(
      docsDirLine!.trim().startsWith('docs_dir: "') && docsDirLine!.trim().endsWith('"'),
      `docs_dir value must be a double-quoted YAML scalar; got: ${docsDirLine}`
    );
  });

  test("site_name is also double-quoted and round-trips a value containing '#'", async () => {
    await generateMkdocsWorkspace(storeDir, { siteName: "Proj #1 Docs" });
    const content = await readFile(join(storeDir, "site-docs", "mkdocs.yml"), "utf8");
    const siteNameLine = content.split("\n").find((line) => line.startsWith("site_name:"));
    assert.ok(siteNameLine, `expected a site_name line; got: ${content}`);
    assert.ok(
      siteNameLine!.includes("Proj #1 Docs"),
      `site_name must include the full value, not be truncated at the comment marker; got: ${siteNameLine}`
    );
    assert.ok(
      siteNameLine!.trim().startsWith('site_name: "') && siteNameLine!.trim().endsWith('"'),
      `site_name value must be a double-quoted YAML scalar; got: ${siteNameLine}`
    );
  });
});

// ─── Finding #1: docs port 0 is rejected ─────────────────────────────────────
//
// MkDocs has no ephemeral-port mode; port 0 must be rejected before preflight.
// Kanban's parsePortFlag intentionally keeps 0 valid (OS-assigned ports).

describe("acs site docs --port 0 is rejected (docs engine cannot use ephemeral port)", () => {
  // Port validation fires in the index.ts dispatch (parsePortFlag with
  // allowZero:false) before store resolution or mkdocsPreflight(), so no store
  // or mkdocs installation is needed for these tests.

  test("exits non-zero when --port 0 is supplied", () => {
    const r = runCli(["site", "docs", "--port", "0"]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stdout: ${r.stdout}`);
  });

  test("error message mentions 'between 1 and 65535'", () => {
    const r = runCli(["site", "docs", "--port", "0"]);
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes("1 and 65535"),
      `expected "between 1 and 65535" in output; got: ${combined}`
    );
  });

  test("error message includes the invalid value 0", () => {
    const r = runCli(["site", "docs", "--port", "0"]);
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes('"0"') || combined.includes("got 0") || combined.includes("got \"0\""),
      `expected the invalid value in error output; got: ${combined}`
    );
  });

  test("exits non-zero when --docs-port 0 is supplied to bare acs site", () => {
    // handleSiteBoth validates docsPort === 0 before rebuildKanbanSite,
    // so this exits fast even without an initialised store in cwd.
    const r = runCli(["site", "--docs-port", "0"]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stdout: ${r.stdout}`);
  });

  test("--docs-port 0 error message mentions 'between 1 and 65535'", () => {
    const r = runCli(["site", "--docs-port", "0"]);
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes("1 and 65535"),
      `expected "between 1 and 65535" in output; got: ${combined}`
    );
  });

  test("kanban --port 0 is still accepted (ephemeral port mode must stay valid)", async () => {
    // Port validation for kanban uses parsePortFlag which allows 0.
    // A temp store dir is needed so buildSiteModel doesn't fail.
    await withTempProject("acs-kanban-port0-", async (dir) => {
      runCli(["init", dir]);
      // We can't easily run a live server synchronously, but we can confirm
      // the argument is not rejected by checking --build-only (which uses the
      // same arg-parse path and ignores port).
      const r = runCli(["site", "kanban", "--build-only", "--port", "0"], { cwd: dir });
      // --build-only with port 0 is fine: port is parsed (valid) but not used
      assert.equal(r.status, 0, `kanban --port 0 must not be rejected; stderr: ${r.stderr}`);
    });
  });
});

// ─── Finding F5: valueless string flags must error, not silently default ─────
//
// The tokenizer stores `--port` followed by another `--flag` (or end of args)
// as boolean true; getStringFlag returned undefined for it, indistinguishable
// from the flag being absent, so callers silently fell back to the default.
// getStringFlagStrict now throws a clear "--flag requires a value" error.

describe("acs site --port/--host/--task without a value errors clearly (F5)", () => {
  test("kanban --port followed by another flag exits non-zero with a clear error", () => {
    const r = runCli(["site", "kanban", "--port", "--no-watch"]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stdout: ${r.stdout}`);
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes("--port") && combined.includes("requires a value"),
      `expected a clear --port error; got: ${combined}`
    );
  });

  test("kanban --host at end of args exits non-zero with a clear error", () => {
    const r = runCli(["site", "kanban", "--host"]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stdout: ${r.stdout}`);
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes("--host") && combined.includes("requires a value"),
      `expected a clear --host error; got: ${combined}`
    );
  });

  test("kanban --task followed by another flag exits non-zero with a clear error", () => {
    const r = runCli(["site", "kanban", "--build-only", "--task", "--open"]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stdout: ${r.stdout}`);
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes("--task") && combined.includes("requires a value"),
      `expected a clear --task error; got: ${combined}`
    );
  });

  test("docs --port at end of args exits non-zero with a clear error", () => {
    const r = runCli(["site", "docs", "--port"]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stdout: ${r.stdout}`);
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes("--port") && combined.includes("requires a value"),
      `expected a clear --port error; got: ${combined}`
    );
  });

  test("docs --host at end of args exits non-zero with a clear error", () => {
    const r = runCli(["site", "docs", "--host"]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stdout: ${r.stdout}`);
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes("--host") && combined.includes("requires a value"),
      `expected a clear --host error; got: ${combined}`
    );
  });

  test("bare site --kanban-port at end of args exits non-zero with a clear error", () => {
    const r = runCli(["site", "--kanban-port"]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stdout: ${r.stdout}`);
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes("--kanban-port") && combined.includes("requires a value"),
      `expected a clear --kanban-port error; got: ${combined}`
    );
  });

  test("bare site --docs-port at end of args exits non-zero with a clear error", () => {
    const r = runCli(["site", "--docs-port"]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stdout: ${r.stdout}`);
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes("--docs-port") && combined.includes("requires a value"),
      `expected a clear --docs-port error; got: ${combined}`
    );
  });

  test("bare site --task at end of args exits non-zero with a clear error", () => {
    const r = runCli(["site", "--kanban-port", "0", "--task"]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stdout: ${r.stdout}`);
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes("--task") && combined.includes("requires a value"),
      `expected a clear --task error; got: ${combined}`
    );
  });

  test("--port with an actual value is unaffected (regression guard)", async () => {
    await withTempProject("acs-f5-port-value-", async (dir) => {
      runCli(["init", dir]);
      const r = runCli(["site", "kanban", "--build-only", "--port", "9000"], { cwd: dir });
      assert.equal(r.status, 0, `--port 9000 must still work; stderr: ${r.stderr}`);
    });
  });
});

// ─── Finding SECURITY #1: acs site docs --host is validated ───────────────────
//
// The docs host flows into `mkdocs serve --dev-addr <host>:<port>` spawned with
// shell:true on win32, so a hostile --host would let cmd.exe re-parse
// metacharacters. Parsing moved into the index.ts dispatch which runs the
// shared validateHost() before the value can reach docs.ts / the shell.

describe("acs site docs --host rejects metacharacters", () => {
  // validateHost fires in dispatch before store resolution / mkdocs preflight,
  // so no store or mkdocs installation is needed.

  test("--host with & exits non-zero", () => {
    const r = runCli(["site", "docs", "--host", "127.0.0.1&calc"]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stdout: ${r.stdout}`);
  });

  test("--host error message names the invalid host or invalid characters", () => {
    const r = runCli(["site", "docs", "--host", "127.0.0.1&calc"]);
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes("127.0.0.1&calc") || combined.includes("invalid characters"),
      `expected invalid host in message; got: ${combined}`
    );
  });

  test("--host with a space exits non-zero", () => {
    const r = runCli(["site", "docs", "--host", "bad host"]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stdout: ${r.stdout}`);
  });
});

// ─── Finding #2: --host validation rejects shell metacharacters ───────────────
//
// openBrowser on win32 passes the URL through "cmd /c start"; a hostile --host
// containing & would let cmd.exe re-parse metacharacters. validateHost() blocks
// this at argument-parse time with a clear upfront error.

describe("acs site kanban --host rejects metacharacters", () => {
  // validateHost fires before rebuildKanbanSite, so no store is needed.

  test("--host with & exits non-zero", () => {
    const r = runCli(["site", "kanban", "--host", "127.0.0.1&calc"]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stdout: ${r.stdout}`);
  });

  test("--host error message names the invalid host", () => {
    const r = runCli(["site", "kanban", "--host", "127.0.0.1&calc"]);
    const combined = r.stdout + r.stderr;
    assert.ok(
      combined.includes("127.0.0.1&calc") || combined.includes("invalid characters"),
      `expected invalid host in message; got: ${combined}`
    );
  });

  test("--host with space exits non-zero", () => {
    const r = runCli(["site", "kanban", "--host", "bad host"]);
    assert.notEqual(r.status, 0, `expected non-zero exit; stdout: ${r.stdout}`);
  });

  test("normal hosts are accepted: localhost", async () => {
    await withTempProject("acs-host-ok-", async (dir) => {
      runCli(["init", dir]);
      // --build-only skips serving so validateHost passes and we get a build
      const r = runCli(["site", "kanban", "--build-only", "--host", "localhost"], { cwd: dir });
      assert.equal(r.status, 0, `localhost must be accepted; stderr: ${r.stderr}`);
    });
  });

  test("normal hosts are accepted: 127.0.0.1", async () => {
    await withTempProject("acs-host-ok2-", async (dir) => {
      runCli(["init", dir]);
      const r = runCli(["site", "kanban", "--build-only", "--host", "127.0.0.1"], { cwd: dir });
      assert.equal(r.status, 0, `127.0.0.1 must be accepted; stderr: ${r.stderr}`);
    });
  });

  test("normal hosts are accepted: 0.0.0.0", async () => {
    await withTempProject("acs-host-ok3-", async (dir) => {
      runCli(["init", dir]);
      const r = runCli(["site", "kanban", "--build-only", "--host", "0.0.0.0"], { cwd: dir });
      assert.equal(r.status, 0, `0.0.0.0 must be accepted; stderr: ${r.stderr}`);
    });
  });
});

// ─── Markdown renderer unit tests ─────────────────────────────────────────────

describe("Markdown renderer (buildRendererJs)", () => {
  // Evaluate the renderer once for the entire describe block.
  type Renderer = { renderMarkdown: (src: string) => string; renderInline: (text: string) => string };
  const renderer: Renderer = new Function(buildRendererJs())() as Renderer;
  const { renderMarkdown, renderInline } = renderer;

  test("renders h1..h6 headings", () => {
    assert.ok(renderMarkdown("# Hello").includes("<h1>Hello</h1>"));
    assert.ok(renderMarkdown("## Sub").includes("<h2>Sub</h2>"));
    assert.ok(renderMarkdown("###### Deep").includes("<h6>Deep</h6>"));
  });

  test("renders unordered lists", () => {
    const html = renderMarkdown("- apple\n- banana");
    assert.ok(html.includes("<ul>"), `expected <ul>: ${html}`);
    assert.ok(html.includes("</ul>"), `expected </ul>: ${html}`);
    assert.ok(html.includes("<li>apple</li>"), `expected apple li: ${html}`);
    assert.ok(html.includes("<li>banana</li>"), `expected banana li: ${html}`);
  });

  test("renders ordered lists", () => {
    const html = renderMarkdown("1. first\n2. second");
    assert.ok(html.includes("<ol>"), `expected <ol>: ${html}`);
    assert.ok(html.includes("</ol>"), `expected </ol>: ${html}`);
    assert.ok(html.includes("<li>first</li>"), `expected first li: ${html}`);
    assert.ok(html.includes("<li>second</li>"), `expected second li: ${html}`);
  });

  test("renders fenced code blocks", () => {
    const fence = String.fromCharCode(96, 96, 96);
    const html = renderMarkdown(`${fence}js\nconsole.log('hi');\n${fence}`);
    assert.ok(html.includes("<pre>"), `expected <pre>: ${html}`);
    assert.ok(html.includes("<code"), `expected <code: ${html}`);
    assert.ok(html.includes("lang-js"), `expected lang-js class: ${html}`);
    assert.ok(html.includes("console.log(&#39;hi&#39;);"), `expected escaped content: ${html}`);
  });

  test("renders inline code", () => {
    const bt = String.fromCharCode(96);
    const html = renderInline(`some ${bt}code here${bt} text`);
    assert.ok(html.includes("<code>code here</code>"), `expected inline code: ${html}`);
  });

  test("renders safe http and https links", () => {
    const html = renderInline("[click](https://example.com)");
    assert.ok(html.includes('<a href="https://example.com">'), `expected anchor: ${html}`);
    assert.ok(html.includes("click"), `expected label: ${html}`);
  });

  test("renders mailto links", () => {
    const html = renderInline("[email](mailto:test@example.com)");
    assert.ok(html.includes("mailto:"), `expected mailto scheme in href: ${html}`);
    assert.ok(html.includes("<a "), `expected anchor element: ${html}`);
  });

  test("renders relative and anchor links", () => {
    const relHtml = renderInline("[rel](/path/to/page)");
    assert.ok(relHtml.includes('<a href="/path/to/page">'), `expected relative anchor: ${relHtml}`);
    const anchorHtml = renderInline("[anchor](#section)");
    assert.ok(anchorHtml.includes('<a href="#section">'), `expected hash anchor: ${anchorHtml}`);
  });

  test("rejects javascript: URLs — degrades to label text only", () => {
    const html = renderInline("[click](javascript:alert(1))");
    assert.ok(!html.includes("<a "), `must not emit anchor: ${html}`);
    assert.ok(!html.includes("javascript:"), `must not include scheme in output: ${html}`);
    assert.ok(html.includes("click"), `label must still appear as text: ${html}`);
  });

  test("rejects data: URLs", () => {
    const html = renderInline("[img](data:text/html,<script>evil()</script>)");
    assert.ok(!html.includes("<a "), `must not emit anchor for data: URL: ${html}`);
  });

  test("rejects vbscript: URLs", () => {
    const html = renderInline("[x](vbscript:msgbox(1))");
    assert.ok(!html.includes("<a "), `must not emit anchor for vbscript: URL: ${html}`);
  });

  test("escapes HTML in normal text", () => {
    const html = renderMarkdown("<script>alert('xss')</script>");
    assert.ok(!html.includes("<script>"), `must not include raw <script>: ${html}`);
    assert.ok(html.includes("&lt;script&gt;"), `expected escaped script tag: ${html}`);
  });

  test("escapes & < > in paragraphs", () => {
    const html = renderMarkdown("a & b < c > d");
    assert.ok(html.includes("&amp;"), `expected &amp;: ${html}`);
    assert.ok(html.includes("&lt;"), `expected &lt;: ${html}`);
    assert.ok(html.includes("&gt;"), `expected &gt;: ${html}`);
  });

  test("escapes HTML special chars in link labels", () => {
    const html = renderInline("[<evil>](https://example.com)");
    assert.ok(!html.includes("<evil>"), `must escape label: ${html}`);
    assert.ok(html.includes("&lt;evil&gt;"), `expected escaped label: ${html}`);
  });
});

// ─── Finding F7: formatHostForUrl brackets IPv6 literals for printed URLs ────
//
// http://${host}:${port}/ was built directly from an unbracketed IPv6 host
// (e.g. "::1"), producing an invalid URL like "http://::1:8000/". A bracketed
// host must stay bracketed unchanged; a plain hostname/IPv4 must be untouched.

describe("formatHostForUrl (F7)", () => {
  test("brackets a bare IPv6 literal", () => {
    assert.equal(formatHostForUrl("::1"), "[::1]");
  });

  test("brackets a full IPv6 address", () => {
    assert.equal(formatHostForUrl("2001:db8::1"), "[2001:db8::1]");
  });

  test("leaves an already-bracketed IPv6 literal unchanged", () => {
    assert.equal(formatHostForUrl("[::1]"), "[::1]");
  });

  test("leaves a hostname unchanged", () => {
    assert.equal(formatHostForUrl("localhost"), "localhost");
  });

  test("leaves an IPv4 address unchanged", () => {
    assert.equal(formatHostForUrl("127.0.0.1"), "127.0.0.1");
    assert.equal(formatHostForUrl("0.0.0.0"), "0.0.0.0");
  });
});

// ─── acs handoff approve ──────────────────────────────────────────────────────

describe("acs handoff approve", () => {
  let dir: string;

  before(() => {
    dir = makeTempDir("acs-cli-approve-");
    runCli(["init", dir]);
    // Create an srs artifact so ba->sa strict validation passes
    runCli(["new", "srs", "--task", "CLI-APPR-001", "--title", "CLI Approve SRS"], { cwd: dir });
    runCli(["handoff", "create", "--from", "ba", "--to", "sa", "--task", "CLI-APPR-001"], { cwd: dir });
  });
  after(() => cleanupTempDir(dir));

  test("approve by id exits 0 and outputs Approved handoff", () => {
    const r = runCli(["handoff", "approve", "HOFF-CLI-APPR-001-BA-SA"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.ok(r.stdout.includes("Approved handoff"), `stdout: ${r.stdout}`);
  });

  test("idempotent re-approve exits 0", () => {
    // Already approved from previous test - should be no-op
    const r = runCli(["handoff", "approve", "HOFF-CLI-APPR-001-BA-SA"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });
});

describe("acs handoff approve — reviewer from env", () => {
  let dir: string;

  before(() => {
    dir = makeTempDir("acs-cli-approve-env-");
    runCli(["init", dir]);
    runCli(["new", "srs", "--task", "CLI-APPR-ENV", "--title", "Env SRS"], { cwd: dir });
    runCli(["handoff", "create", "--from", "ba", "--to", "sa", "--task", "CLI-APPR-ENV"], { cwd: dir });
  });
  after(() => cleanupTempDir(dir));

  test("ACS_REVIEWER env var is used as reviewer when --reviewer not provided", async () => {
    const r = runCli(["handoff", "approve", "HOFF-CLI-APPR-ENV-BA-SA"], {
      cwd: dir,
      env: { ...process.env, ACS_REVIEWER: "env-reviewer" }
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    // Check YAML contains reviewer
    const handoffPath = join(dir, ".acs", "handoffs", "CLI-APPR-ENV", "HOFF-CLI-APPR-ENV-BA-SA.yaml");
    const content = await readFile(handoffPath, "utf8");
    assert.ok(content.includes("reviewer: env-reviewer"), `Expected reviewer in YAML:\n${content}`);
  });
});

describe("acs handoff unknown action", () => {
  test("unknown handoff action error message contains 'approve'", () => {
    const dir = makeTempDir("acs-cli-unknown-handoff-");
    runCli(["init", dir]);
    const r = runCli(["handoff", "unknown-action"], { cwd: dir });
    assert.notEqual(r.status, 0);
    const output = r.stderr + r.stdout;
    assert.ok(output.includes("approve"), `Error message should mention 'approve': ${output}`);
    cleanupTempDir(dir);
  });
});
