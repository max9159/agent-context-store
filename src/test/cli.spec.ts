import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { makeTempDir, cleanupTempDir, runCli, exists, readText } from "./helpers.ts";
import { buildRendererJs } from "../packages/cli/dist/index.js";

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

// ─── acs site build ───────────────────────────────────────────────────────────

describe("acs site build", () => {
  let dir: string;

  before(() => {
    dir = makeTempDir("acs-cli-site-");
    runCli(["init", dir]);
    runCli(["new", "srs", "--task", "SITE-001", "--title", "Site SRS"], { cwd: dir });
    runCli(["new", "srs", "--task", "SITE-002", "--title", "Other SRS"], { cwd: dir });
  });
  after(() => cleanupTempDir(dir));

  test("creates site/index.html under the store root", () => {
    const r = runCli(["site", "build"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr} stdout: ${r.stdout}`);
    assert.ok(exists(join(dir, ".acs/site/index.html")), "site/index.html should exist");
  });

  test("creates site/data/model.json", () => {
    const r = runCli(["site", "build"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, ".acs/site/data/model.json")), "site/data/model.json should exist");
  });

  test("creates site/assets/site.css", () => {
    const r = runCli(["site", "build"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, ".acs/site/assets/site.css")), "site/assets/site.css should exist");
  });

  test("creates site/assets/site.js", () => {
    const r = runCli(["site", "build"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, ".acs/site/assets/site.js")), "site/assets/site.js should exist");
  });

  test("model.json has required top-level keys", async () => {
    runCli(["site", "build"], { cwd: dir });
    const content = await readFile(join(dir, ".acs/site/data/model.json"), "utf8");
    const model = JSON.parse(content);
    assert.ok(typeof model.generatedAt === "string", "model.generatedAt must be a string");
    assert.ok(Array.isArray(model.tasks), "model.tasks must be an array");
    assert.ok(Array.isArray(model.artifacts), "model.artifacts must be an array");
    assert.ok(Array.isArray(model.handoffs), "model.handoffs must be an array");
    assert.ok(typeof model.validation === "object" && model.validation !== null, "model.validation must be an object");
    assert.ok(typeof model.store === "object" && model.store !== null, "model.store must be an object");
  });

  test("--task flag filters model.json to the specified task", async () => {
    const r = runCli(["site", "build", "--task", "SITE-001"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const content = await readFile(join(dir, ".acs/site/data/model.json"), "utf8");
    const model = JSON.parse(content);
    const taskIds = model.tasks.map((t: { taskId: string }) => t.taskId);
    assert.ok(taskIds.includes("SITE-001"), "model.tasks should include SITE-001");
    assert.ok(!taskIds.includes("SITE-002"), "model.tasks should not include SITE-002 when filtered");
    const artifactTaskIds = new Set(model.artifacts.map((a: { taskId: string }) => a.taskId));
    assert.ok(!artifactTaskIds.has("SITE-002"), "model.artifacts should not include SITE-002 when filtered");
  });

  test("output reports generated file paths", () => {
    const r = runCli(["site", "build"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes("index.html") || r.stdout.includes("model.json"), `expected path in output; stdout: ${r.stdout}`);
  });

  test("help text mentions site build", () => {
    const r = runCli(["--help"]);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes("site build"), `expected "site build" in help; stdout: ${r.stdout}`);
  });

  test("--task with a nonexistent task prints a notice and exits 0", () => {
    const r = runCli(["site", "build", "--task", "TASK-DOES-NOT-EXIST"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes("notice") || r.stdout.includes("no artifacts"), `expected notice in stdout: ${r.stdout}`);
  });
});

// ─── existing commands unaffected after site build ────────────────────────────

describe("existing commands unaffected by site build", () => {
  let dir: string;

  before(() => {
    dir = makeTempDir("acs-cli-site-compat-");
    runCli(["init", dir]);
    runCli(["new", "srs", "--task", "COMPAT-001", "--title", "Compat SRS"], { cwd: dir });
    runCli(["site", "build"], { cwd: dir });
  });
  after(() => cleanupTempDir(dir));

  test("acs index works after site build", () => {
    const r = runCli(["index"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  test("acs validate works after site build", () => {
    const r = runCli(["validate"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  test("acs status works after site build", () => {
    const r = runCli(["status"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  test("site/ directory is not scanned by acs index", async () => {
    const r = runCli(["index"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const indexContent = await readFile(join(dir, ".acs/index.json"), "utf8");
    const index = JSON.parse(indexContent);
    for (const artifact of index.artifacts) {
      assert.ok(!(artifact.path as string).includes("site/"), `index should not include site/ artifact: ${artifact.path as string}`);
    }
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
