import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import os from "node:os";
import { makeTempDir, cleanupTempDir, exists, readText } from "./helpers.ts";

import {
  initContextStore,
  createArtifact,
  validateContextStore,
  createHandoff,
  checkHandoff,
  buildContextPackage,
  buildIndex,
  doctor,
  getStoreInfo,
  type ArtifactType
} from "../packages/core/dist/index.js";

// ─── initContextStore — Mode 1 (in-repo, default) ────────────────────────────

describe("initContextStore — in-repo (default)", () => {
  let dir: string;
  before(() => { dir = makeTempDir("acs-core-init-"); });
  after(() => cleanupTempDir(dir));

  test("creates .acs/ layout directories", async () => {
    await initContextStore({ rootDir: dir });
    for (const sub of [
      ".acs",
      ".acs/artifacts/requirements",
      ".acs/artifacts/design",
      ".acs/artifacts/adr",
      ".acs/artifacts/api",
      ".acs/artifacts/test",
      ".acs/handoffs",
      ".acs/summaries",
      ".acs/packages",
      ".acs/schemas",
      ".acs/templates",
      ".acs/docs",
      ".acs/audit"
    ]) {
      assert.ok(exists(join(dir, sub)), `Missing: ${sub}`);
    }
  });

  test("writes config.yaml and index.json inside .acs/", async () => {
    const config = await readText(join(dir, ".acs/config.yaml"));
    assert.ok(config.includes("agent-context-store"));
    assert.ok(config.includes("mode: in-repo"));
    const index = JSON.parse(await readText(join(dir, ".acs/index.json")));
    assert.deepEqual(index.artifacts, []);
    assert.deepEqual(index.handoffs, []);
  });

  test("is idempotent - second run does not throw", async () => {
    await assert.doesNotReject(() => initContextStore({ rootDir: dir }));
  });
});

describe("initContextStore — in-repo explicit mode flag", () => {
  let dir: string;
  before(() => { dir = makeTempDir("acs-core-init-inrepo-"); });
  after(() => cleanupTempDir(dir));

  test("--mode in-repo creates same layout", async () => {
    await initContextStore({ rootDir: dir, mode: "in-repo" });
    assert.ok(exists(join(dir, ".acs/config.yaml")));
    const config = await readText(join(dir, ".acs/config.yaml"));
    assert.ok(config.includes("mode: in-repo"));
  });
});

// ─── initContextStore — Mode 4 (dedicated) ───────────────────────────────────

describe("initContextStore — dedicated mode", () => {
  let dir: string;
  before(() => { dir = makeTempDir("acs-core-init-dedicated-"); });
  after(() => cleanupTempDir(dir));

  test("creates layout at root (no .acs/ prefix)", async () => {
    await initContextStore({ rootDir: dir, mode: "dedicated" });
    for (const sub of [
      "artifacts/requirements",
      "artifacts/design",
      "artifacts/adr",
      "artifacts/api",
      "artifacts/test",
      "handoffs",
      "summaries",
      "packages",
      "schemas",
      "templates",
      "docs",
      "audit"
    ]) {
      assert.ok(exists(join(dir, sub)), `Missing: ${sub}`);
    }
  });

  test("config.yaml is at root with mode: dedicated", async () => {
    const config = await readText(join(dir, "config.yaml"));
    assert.ok(config.includes("mode: dedicated"));
  });

  test("index.json is at root", async () => {
    assert.ok(exists(join(dir, "index.json")));
  });
});

// ─── initContextStore — Mode 2 (local) ───────────────────────────────────────

describe("initContextStore — local mode", () => {
  let dir: string;
  before(() => { dir = makeTempDir("acs-core-init-local-"); });
  after(() => cleanupTempDir(dir));

  test("does not write .acs/ into the project", async () => {
    await initContextStore({ rootDir: dir, mode: "local" });
    assert.ok(!exists(join(dir, ".acs")));
    assert.ok(!exists(join(dir, "artifacts")));
  });

  test("creates actual store layout in OS user-data directory", async () => {
    const info = await getStoreInfo(dir);
    assert.equal(info.mode, "local");
    assert.ok(exists(join(info.storeDir, "artifacts/requirements")));
    assert.ok(exists(join(info.storeDir, "handoffs")));
    assert.ok(exists(join(info.storeDir, "config.yaml")));
    const config = await readText(join(info.storeDir, "config.yaml"));
    assert.ok(config.includes("mode: local"));
    assert.ok(config.includes("project_path:"));
  });

  test("store is not inside the project directory", async () => {
    const info = await getStoreInfo(dir);
    // storeDir should be in OS data dir, not inside the project
    const home = os.homedir();
    const isUserDataDir =
      info.storeDir.includes("agent-context-store") && !info.storeDir.startsWith(dir);
    assert.ok(isUserDataDir, `Expected storeDir to be in user-data area, got: ${info.storeDir}`);
  });
});

// ─── getStoreInfo ─────────────────────────────────────────────────────────────

describe("getStoreInfo", () => {
  test("returns initialized:false for empty dir", async () => {
    const dir = makeTempDir("acs-core-info-empty-");
    const info = await getStoreInfo(dir);
    assert.equal(info.initialized, false);
    await cleanupTempDir(dir);
  });

  test("returns initialized:true after in-repo init", async () => {
    const dir = makeTempDir("acs-core-info-ok-");
    await initContextStore({ rootDir: dir });
    const info = await getStoreInfo(dir);
    assert.equal(info.initialized, true);
    assert.equal(info.mode, "in-repo");
    await cleanupTempDir(dir);
  });

  test("returns mode:dedicated for dedicated init", async () => {
    const dir = makeTempDir("acs-core-info-dedicated-");
    await initContextStore({ rootDir: dir, mode: "dedicated" });
    const info = await getStoreInfo(dir);
    assert.equal(info.mode, "dedicated");
    assert.equal(info.storeDir, dir);
    await cleanupTempDir(dir);
  });
});

// ─── createArtifact ────────────────────────────────────────────────────────────

describe("createArtifact", () => {
  let dir: string;
  before(async () => {
    dir = makeTempDir("acs-core-artifact-");
    await initContextStore({ rootDir: dir });
  });
  after(() => cleanupTempDir(dir));

  const artifactTypes: ArtifactType[] = ["srs", "sdd", "adr", "api", "test"];
  for (const type of artifactTypes) {
    test(`creates ${type} artifact under .acs/`, async () => {
      const result = await createArtifact({ rootDir: dir, type, taskId: `TASK-${type.toUpperCase()}`, title: `Test ${type}` });
      assert.ok(exists(join(dir, result.artifactPath)), `Artifact not found: ${result.artifactPath}`);
      assert.ok(result.artifactPath.startsWith(".acs/"), `Expected path under .acs/, got: ${result.artifactPath}`);
      assert.ok(result.artifactId.length > 0);
    });
  }

  test("throws on duplicate artifact ID", async () => {
    await assert.rejects(
      () => createArtifact({ rootDir: dir, type: "srs", taskId: "TASK-SRS", title: "Duplicate" }),
      /already exists/
    );
  });
});

// ─── validateContextStore / doctor ────────────────────────────────────────────

describe("validateContextStore", () => {
  let dir: string;
  before(async () => {
    dir = makeTempDir("acs-core-validate-");
    await initContextStore({ rootDir: dir });
  });
  after(() => cleanupTempDir(dir));

  test("passes for an initialized store", async () => {
    const result = await validateContextStore(dir);
    assert.equal(result.valid, true, `Unexpected errors: ${result.errors.join(", ")}`);
  });

  test("reports missing layout dirs for empty directory", async () => {
    const emptyDir = makeTempDir("acs-core-empty-");
    try {
      const result = await validateContextStore(emptyDir);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes("Missing directory")));
    } finally {
      await cleanupTempDir(emptyDir);
    }
  });
});

describe("doctor", () => {
  let dir: string;
  before(async () => {
    dir = makeTempDir("acs-core-doctor-");
    await initContextStore({ rootDir: dir });
  });
  after(() => cleanupTempDir(dir));

  test("passes after init", async () => {
    const result = await doctor(dir);
    assert.equal(result.valid, true);
  });
});

// ─── createHandoff / checkHandoff ─────────────────────────────────────────────

describe("createHandoff", () => {
  let dir: string;
  before(async () => {
    dir = makeTempDir("acs-core-handoff-");
    await initContextStore({ rootDir: dir });
    await createArtifact({ rootDir: dir, type: "srs", taskId: "TASK-101", title: "Requirements" });
  });
  after(() => cleanupTempDir(dir));

  test("creates a handoff yaml under .acs/handoffs/", async () => {
    const result = await createHandoff({ rootDir: dir, fromRole: "sa", toRole: "dev", taskId: "TASK-101" });
    assert.ok(exists(join(dir, result.handoffPath)));
    assert.ok(result.handoffPath.startsWith(".acs/"), `Expected path under .acs/, got: ${result.handoffPath}`);
    const content = await readText(join(dir, result.handoffPath));
    assert.ok(content.includes("TASK-101"));
  });

  test("checkHandoff passes for valid handoff", async () => {
    const hresult = await createHandoff({ rootDir: dir, fromRole: "ba", toRole: "sa", taskId: "TASK-101" });
    const check = await checkHandoff(dir, hresult.handoffId);
    assert.equal(check.valid, true, `Errors: ${check.errors.join(", ")}`);
  });

  test("checkHandoff fails for missing handoff", async () => {
    const check = await checkHandoff(dir, "HOFF-NONEXISTENT");
    assert.equal(check.valid, false);
    assert.ok(check.errors.length > 0);
  });
});

// ─── buildContextPackage ──────────────────────────────────────────────────────

describe("buildContextPackage", () => {
  let dir: string;
  before(async () => {
    dir = makeTempDir("acs-core-package-");
    await initContextStore({ rootDir: dir });
    await createArtifact({ rootDir: dir, type: "srs", taskId: "TASK-200", title: "Package SRS" });
  });
  after(() => cleanupTempDir(dir));

  test("creates markdown package under .acs/packages/", async () => {
    const result = await buildContextPackage({ rootDir: dir, taskId: "TASK-200", role: "dev" });
    assert.ok(result.packagePath.endsWith(".md"));
    assert.ok(exists(join(dir, result.packagePath)));
    assert.ok(result.packagePath.startsWith(".acs/"), `Expected path under .acs/, got: ${result.packagePath}`);
  });

  test("creates JSON package when format is json", async () => {
    const result = await buildContextPackage({ rootDir: dir, taskId: "TASK-200", role: "dev", format: "json" });
    assert.ok(result.packagePath.endsWith(".json"));
    const json = JSON.parse(await readText(join(dir, result.packagePath)));
    assert.equal(json.task_id, "TASK-200");
  });
});

// ─── buildIndex ───────────────────────────────────────────────────────────────

describe("buildIndex", () => {
  let dir: string;
  before(async () => {
    dir = makeTempDir("acs-core-index-");
    await initContextStore({ rootDir: dir });
    await createArtifact({ rootDir: dir, type: "srs", taskId: "TASK-300", title: "Index SRS" });
  });
  after(() => cleanupTempDir(dir));

  test("writes .acs/index.json", async () => {
    const result = await buildIndex(dir);
    assert.ok(exists(join(dir, ".acs/index.json")));
    assert.equal(typeof result.artifactCount, "number");
    assert.equal(typeof result.handoffCount, "number");
  });

  test("reflects created artifacts", async () => {
    const result = await buildIndex(dir);
    assert.ok(result.artifactCount >= 1);
  });
});

// ─── dedicated mode round-trip ────────────────────────────────────────────────

describe("dedicated mode — artifact round-trip", () => {
  let dir: string;
  before(async () => {
    dir = makeTempDir("acs-core-dedicated-rt-");
    await initContextStore({ rootDir: dir, mode: "dedicated" });
  });
  after(() => cleanupTempDir(dir));

  test("creates artifact at root-level path (no .acs/ prefix)", async () => {
    const result = await createArtifact({ rootDir: dir, type: "srs", taskId: "DED-001", title: "Dedicated SRS" });
    assert.ok(exists(join(dir, result.artifactPath)));
    assert.ok(!result.artifactPath.startsWith(".acs/"), `Expected no .acs/ prefix, got: ${result.artifactPath}`);
  });

  test("validates dedicated store", async () => {
    const result = await validateContextStore(dir);
    assert.equal(result.valid, true, `Errors: ${result.errors.join(", ")}`);
  });
});
