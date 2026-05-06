import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
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
  type ArtifactType
} from "../packages/core/dist/index.js";

// ─── initContextStore ──────────────────────────────────────────────────────────

describe("initContextStore", () => {
  let dir: string;
  before(() => { dir = makeTempDir("acs-core-init-"); });
  after(() => cleanupTempDir(dir));

  test("creates layout directories", async () => {
    await initContextStore({ rootDir: dir });
    for (const sub of [
      ".context-store",
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
      "docs"
    ]) {
      assert.ok(exists(join(dir, sub)), `Missing: ${sub}`);
    }
  });

  test("writes config.yaml and index.json", async () => {
    const config = await readText(join(dir, ".context-store/config.yaml"));
    assert.ok(config.includes("agent-context-store"));
    const index = JSON.parse(await readText(join(dir, ".context-store/index.json")));
    assert.deepEqual(index.artifacts, []);
    assert.deepEqual(index.handoffs, []);
  });

  test("is idempotent - second run does not throw", async () => {
    await assert.doesNotReject(() => initContextStore({ rootDir: dir }));
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
    test(`creates ${type} artifact`, async () => {
      const result = await createArtifact({ rootDir: dir, type, taskId: `TASK-${type.toUpperCase()}`, title: `Test ${type}` });
      assert.ok(exists(join(dir, result.artifactPath)), `Artifact not found: ${result.artifactPath}`);
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

  test("creates a handoff yaml", async () => {
    const result = await createHandoff({ rootDir: dir, fromRole: "sa", toRole: "dev", taskId: "TASK-101" });
    assert.ok(exists(join(dir, result.handoffPath)));
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

  test("creates markdown package by default", async () => {
    const result = await buildContextPackage({ rootDir: dir, taskId: "TASK-200", role: "dev" });
    assert.ok(result.packagePath.endsWith(".md"));
    assert.ok(exists(join(dir, result.packagePath)));
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

  test("writes .context-store/index.json", async () => {
    const result = await buildIndex(dir);
    assert.ok(exists(join(dir, ".context-store/index.json")));
    assert.equal(typeof result.artifactCount, "number");
    assert.equal(typeof result.handoffCount, "number");
  });

  test("reflects created artifacts", async () => {
    const result = await buildIndex(dir);
    assert.ok(result.artifactCount >= 1);
  });
});
