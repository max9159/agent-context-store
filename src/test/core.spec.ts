import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import os from "node:os";
import { makeTempDir, cleanupTempDir, exists, readText } from "./helpers.ts";

import {
  initContextStore,
  createArtifact,
  validateContextStore,
  validatePolicyScope,
  createHandoff,
  checkHandoff,
  buildContextPackage,
  buildIndex,
  doctor,
  getStoreInfo,
  linkContextStore,
  listRoles,
  explainRole,
  getNextActions,
  buildSiteModel,
  deriveKanbanState,
  type ArtifactType,
  type SiteTask
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
      ".acs/artifacts",
      ".acs/handoffs",
      ".acs/summaries",
      ".acs/packages",
      ".acs/schemas",
      ".acs/templates",
      ".acs/roles",
      ".acs/artifact-types",
      ".acs/workflows",
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
    const acsConfig = await readText(join(dir, ".acs/acs.yaml"));
    assert.ok(acsConfig.includes('artifact_path: "artifacts/{task_id}/{type}/{artifact_id}.{ext}"'));
    const index = JSON.parse(await readText(join(dir, ".acs/index.json")));
    assert.deepEqual(index.artifacts, []);
    assert.deepEqual(index.handoffs, []);
  });

  test("seeds role, artifact type, workflow, template, and schema policies", async () => {
    assert.ok(exists(join(dir, ".acs/acs.yaml")));
    assert.ok(exists(join(dir, ".acs/roles/ba.yaml")));
    assert.ok(exists(join(dir, ".acs/artifact-types/implementation-note.yaml")));
    assert.ok(exists(join(dir, ".acs/workflows/default-sdlc.yaml")));
    assert.ok(exists(join(dir, ".acs/templates/implementation-note.md")));
    assert.ok(exists(join(dir, ".acs/schemas/role.schema.json")));
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
      "artifacts",
      "handoffs",
      "summaries",
      "packages",
      "schemas",
      "templates",
      "roles",
      "artifact-types",
      "workflows",
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

// ─── linkContextStore ────────────────────────────────────────────────────────

describe("linkContextStore", () => {
  test("writes only a project pointer and preserves target mode", async () => {
    const projectDir = makeTempDir("acs-core-link-project-");
    const storeDir = makeTempDir("acs-core-link-store-");
    try {
      await writeFile(join(storeDir, "config.yaml"), "version: 1\ntoolkit: agent-context-store\ncli: acs\nmode: local\n", "utf8");

      const result = await linkContextStore({ projectDir, storeDir });
      assert.deepEqual(result.created, [".acs/config.yaml"]);
      assert.deepEqual((await readdir(storeDir)).sort(), ["config.yaml"]);

      const pointer = await readText(join(projectDir, ".acs", "config.yaml"));
      assert.match(pointer, /mode: local/);
      assert.ok(pointer.includes(storeDir.replaceAll("\\", "/")), pointer);

      const info = await getStoreInfo(projectDir);
      assert.equal(info.mode, "local");
      assert.equal(info.storeDir, storeDir);
    } finally {
      await cleanupTempDir(projectDir);
      await cleanupTempDir(storeDir);
    }
  });

  test("validates ACS identity config before linking", async () => {
    const projectDir = makeTempDir("acs-core-link-invalid-project-");
    const storeDir = makeTempDir("acs-core-link-invalid-store-");
    try {
      await writeFile(join(storeDir, "config.yaml"), "version: 1\nmode: dedicated\n", "utf8");
      await assert.rejects(() => linkContextStore({ projectDir, storeDir }), /toolkit: agent-context-store/);
      assert.ok(!exists(join(projectDir, ".acs", "config.yaml")));
    } finally {
      await cleanupTempDir(projectDir);
      await cleanupTempDir(storeDir);
    }
  });

  test("requires force to replace an existing different pointer", async () => {
    const projectDir = makeTempDir("acs-core-link-force-project-");
    const firstStore = makeTempDir("acs-core-link-force-a-");
    const secondStore = makeTempDir("acs-core-link-force-b-");
    try {
      const config = "version: 1\ntoolkit: agent-context-store\ncli: acs\nmode: dedicated\n";
      await writeFile(join(firstStore, "config.yaml"), config, "utf8");
      await writeFile(join(secondStore, "config.yaml"), config, "utf8");

      await linkContextStore({ projectDir, storeDir: firstStore });
      await assert.rejects(() => linkContextStore({ projectDir, storeDir: secondStore }), /--force/);

      const result = await linkContextStore({ projectDir, storeDir: secondStore, force: true });
      assert.deepEqual(result.updated, [".acs/config.yaml"]);
      assert.ok((await readText(join(projectDir, ".acs", "config.yaml"))).includes(secondStore.replaceAll("\\", "/")));
    } finally {
      await cleanupTempDir(projectDir);
      await cleanupTempDir(firstStore);
      await cleanupTempDir(secondStore);
    }
  });

  test("fails with a meaningful error for a non-existent project or store path", async () => {
    const validProject = makeTempDir("acs-core-link-noexist-project-");
    const validStore = makeTempDir("acs-core-link-noexist-store-");
    try {
      const config = "version: 1\ntoolkit: agent-context-store\ncli: acs\nmode: dedicated\n";
      await writeFile(join(validStore, "config.yaml"), config, "utf8");

      const nonExistentPath = join(validProject, "does-not-exist");
      await assert.rejects(() => linkContextStore({ projectDir: nonExistentPath, storeDir: validStore }), /does not exist/i);
      await assert.rejects(() => linkContextStore({ projectDir: validProject, storeDir: nonExistentPath }), /does not exist/i);
    } finally {
      await cleanupTempDir(validProject);
      await cleanupTempDir(validStore);
    }
  });

  test("fails with a meaningful error when project or store path is a file, not a directory", async () => {
    const projectDir = makeTempDir("acs-core-link-notdir-project-");
    const storeDir = makeTempDir("acs-core-link-notdir-store-");
    try {
      const filePath = join(projectDir, "a-file.txt");
      await writeFile(filePath, "not a dir", "utf8");

      const config = "version: 1\ntoolkit: agent-context-store\ncli: acs\nmode: dedicated\n";
      await writeFile(join(storeDir, "config.yaml"), config, "utf8");

      await assert.rejects(() => linkContextStore({ projectDir: filePath, storeDir }), /is not a directory/i);
      await assert.rejects(() => linkContextStore({ projectDir, storeDir: filePath }), /is not a directory/i);
    } finally {
      await cleanupTempDir(projectDir);
      await cleanupTempDir(storeDir);
    }
  });

  test("no-op when pointer already matches the same store and mode", async () => {
    const projectDir = makeTempDir("acs-core-link-noop-project-");
    const storeDir = makeTempDir("acs-core-link-noop-store-");
    try {
      const config = "version: 1\ntoolkit: agent-context-store\ncli: acs\nmode: dedicated\n";
      await writeFile(join(storeDir, "config.yaml"), config, "utf8");

      const first = await linkContextStore({ projectDir, storeDir });
      assert.deepEqual(first.created, [".acs/config.yaml"]);
      assert.deepEqual(first.updated, []);

      const second = await linkContextStore({ projectDir, storeDir });
      assert.deepEqual(second.created, []);
      assert.deepEqual(second.updated, []);

      const pointer = await readText(join(projectDir, ".acs", "config.yaml"));
      assert.match(pointer, /mode: dedicated/);
    } finally {
      await cleanupTempDir(projectDir);
      await cleanupTempDir(storeDir);
    }
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
    assert.ok(exists(join(info.storeDir, "artifacts")));
    assert.ok(exists(join(info.storeDir, "handoffs")));
    assert.ok(exists(join(info.storeDir, "config.yaml")));
    assert.ok(exists(join(info.storeDir, "acs.yaml")));
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

  const artifactTypes: ArtifactType[] = ["srs", "sdd", "adr", "api", "test", "implementation-note", "test-plan"];
  for (const type of artifactTypes) {
    test(`creates ${type} artifact under .acs/`, async () => {
      const result = await createArtifact({ rootDir: dir, type, taskId: `TASK-${type.toUpperCase()}`, title: `Test ${type}` });
      assert.ok(exists(join(dir, result.artifactPath)), `Artifact not found: ${result.artifactPath}`);
      assert.ok(result.artifactPath.startsWith(".acs/"), `Expected path under .acs/, got: ${result.artifactPath}`);
      assert.ok(result.artifactPath.includes(`/TASK-${type.toUpperCase()}/`), `Expected task-first artifact path, got: ${result.artifactPath}`);
      assert.ok(result.artifactId.length > 0);
    });
  }

  test("throws on duplicate artifact ID", async () => {
    await assert.rejects(
      () => createArtifact({ rootDir: dir, type: "srs", taskId: "TASK-SRS", title: "Duplicate" }),
      /already exists/
    );
  });

  test("enforces role create permissions", async () => {
    await assert.rejects(
      () => createArtifact({ rootDir: dir, type: "srs", role: "dev", taskId: "TASK-ROLE", title: "Role error" }),
      /not allowed to create/
    );
  });

  test("canonicalizes api and test aliases", async () => {
    const api = await createArtifact({ rootDir: dir, type: "api", taskId: "TASK-ALIAS-API", title: "Alias API" });
    assert.ok(api.artifactPath.includes("artifacts/TASK-ALIAS-API/api-design/API-TASK-ALIAS-API.md"), api.artifactPath);
    await assert.rejects(
      () => createArtifact({ rootDir: dir, type: "api-design", taskId: "TASK-ALIAS-API", title: "Canonical API" }),
      /already exists/
    );

    const testPlan = await createArtifact({ rootDir: dir, type: "test", taskId: "TASK-ALIAS-TEST", title: "Alias Test" });
    assert.ok(testPlan.artifactPath.includes("artifacts/TASK-ALIAS-TEST/test-plan/TEST-TASK-ALIAS-TEST.md"), testPlan.artifactPath);
    await assert.rejects(
      () => createArtifact({ rootDir: dir, type: "test-plan", taskId: "TASK-ALIAS-TEST", title: "Canonical Test" }),
      /already exists/
    );
  });
});

describe("role policy helpers", () => {
  let dir: string;
  before(async () => {
    dir = makeTempDir("acs-core-policy-");
    await initContextStore({ rootDir: dir });
    await createArtifact({ rootDir: dir, type: "srs", taskId: "TASK-POLICY", title: "Policy SRS" });
  });
  after(() => cleanupTempDir(dir));

  test("lists roles and explains a role", async () => {
    const roles = await listRoles(dir);
    assert.ok(roles.some((role) => role.role === "dev"));
    const explanation = await explainRole({ rootDir: dir, role: "dev", taskId: "TASK-POLICY" });
    assert.equal(explanation.role, "dev");
    assert.ok(explanation.suggestedCommands.some((command) => command.includes("implementation-note")));
  });

  test("returns next actions for a role", async () => {
    const next = await getNextActions({ rootDir: dir, role: "sa", taskId: "TASK-POLICY" });
    assert.equal(next.role, "sa");
    assert.ok(next.suggestedOutputs.includes("sdd"));
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

  test("reports missing generated policy files", async () => {
    const policyDir = makeTempDir("acs-core-policy-missing-");
    try {
      await initContextStore({ rootDir: policyDir });
      await unlink(join(policyDir, ".acs/roles/ba.yaml"));
      const result = await validateContextStore(policyDir);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((error) => error.includes("Missing policy file: roles/ba.yaml")));
    } finally {
      await cleanupTempDir(policyDir);
    }
  });

  test("reports malformed generated policy documents", async () => {
    const policyDir = makeTempDir("acs-core-policy-malformed-");
    try {
      await initContextStore({ rootDir: policyDir });
      await writeFile(join(policyDir, ".acs/roles/ba.yaml"), "role: 123\n", "utf8");
      const result = await validateContextStore(policyDir);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((error) => error.includes(".acs/roles/ba.yaml: schema")));
    } finally {
      await cleanupTempDir(policyDir);
    }
  });

  test("validates scoped role, task, and artifact inputs", async () => {
    const artifact = await createArtifact({ rootDir: dir, type: "srs", taskId: "TASK-SCOPE", title: "Scoped SRS" });
    const valid = await validatePolicyScope({ rootDir: dir, role: "ba", taskId: "TASK-SCOPE", artifactPath: artifact.artifactPath });
    assert.equal(valid.valid, true, `Unexpected errors: ${valid.errors.join(", ")}`);

    const invalid = await validatePolicyScope({ rootDir: dir, role: "not-a-role", taskId: "TASK-MISSING", artifactPath: ".acs/artifacts/missing.md" });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some((error) => error.includes("Unknown role")));
    assert.ok(invalid.errors.some((error) => error.includes("No artifacts found for task")));
    assert.ok(invalid.errors.some((error) => error.includes("Artifact not found")));
  });

  test("scoped validation matches exact frontmatter task_id", async () => {
    const exactDir = makeTempDir("acs-core-exact-task-");
    try {
      await initContextStore({ rootDir: exactDir });
      await createArtifact({ rootDir: exactDir, type: "srs", taskId: "TASK-10", title: "Overlapping Task" });

      const result = await validatePolicyScope({ rootDir: exactDir, role: "ba", taskId: "TASK-1" });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((error) => error.includes('No artifacts found for task "TASK-1"')), result.errors.join("\n"));
    } finally {
      await cleanupTempDir(exactDir);
    }
  });

  test("validates artifacts created with custom path templates", async () => {
    const customDir = makeTempDir("acs-core-custom-path-");
    try {
      await initContextStore({ rootDir: customDir });
      const typePath = join(customDir, ".acs", "artifact-types", "srs.yaml");
      const typeYaml = await readText(typePath);
      await writeFile(typePath, typeYaml.replace(
        "default_owner: ba",
        'default_owner: ba\npath_template: "artifacts/{task_id}/requirements/{artifact_id}.{ext}"'
      ), "utf8");

      const artifact = await createArtifact({ rootDir: customDir, type: "srs", taskId: "TASK-CUSTOM", title: "Custom Path" });
      assert.equal(artifact.artifactPath, ".acs/artifacts/TASK-CUSTOM/requirements/SRS-TASK-CUSTOM.md");

      const result = await validateContextStore(customDir);
      assert.equal(result.valid, true, `Unexpected errors: ${result.errors.join("\n")}`);
    } finally {
      await cleanupTempDir(customDir);
    }
  });

  test("validates custom path templates that include the creating role", async () => {
    const rolePathDir = makeTempDir("acs-core-role-path-");
    try {
      await initContextStore({ rootDir: rolePathDir });
      const typePath = join(rolePathDir, ".acs", "artifact-types", "handoff-package.yaml");
      const typeYaml = await readText(typePath);
      await writeFile(typePath, typeYaml.replace(
        "default_owner: system",
        'default_owner: system\npath_template: "artifacts/{task_id}/{role}/{artifact_id}.{ext}"'
      ), "utf8");

      const artifact = await createArtifact({ rootDir: rolePathDir, type: "handoff-package", role: "ba", taskId: "TASK-ROLEPATH", title: "Role Path" });
      assert.equal(artifact.artifactPath, ".acs/artifacts/TASK-ROLEPATH/ba/HO-TASK-ROLEPATH.md");

      const result = await validateContextStore(rolePathDir);
      assert.equal(result.valid, true, `Unexpected errors: ${result.errors.join("\n")}`);
    } finally {
      await cleanupTempDir(rolePathDir);
    }
  });

  test("rejects task IDs that are unsafe path segments", async () => {
    await assert.rejects(
      () => createArtifact({ rootDir: dir, type: "srs", taskId: "A/../ESCAPE", title: "Unsafe Task" }),
      /Invalid task id/
    );
  });

  test("rejects legacy type-first artifact paths", async () => {
    const legacyDir = join(dir, ".acs", "artifacts", "srs");
    const legacyPath = join(legacyDir, "SRS-TASK-LEGACY.md");
    await mkdir(legacyDir, { recursive: true });
    await writeFile(legacyPath, [
      "---",
      "id: SRS-TASK-LEGACY",
      "type: srs",
      "title: Legacy SRS",
      "task_id: TASK-LEGACY",
      "owner: ba",
      "status: draft",
      "approval_status: pending",
      "version: 0.1.0",
      "---",
      "",
      "# Legacy SRS",
      ""
    ].join("\n"), "utf8");

    const result = await validateContextStore(dir);
    assert.ok(result.errors.some((error) => error.includes("expected task-first artifact path")), result.errors.join("\n"));
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

  test("policy check enforces configured required_state", async () => {
    const taskId = "TASK-DEV-QA";
    const implementation = await createArtifact({ rootDir: dir, type: "implementation-note", role: "dev", taskId, title: "Implementation" });
    const unit = await createArtifact({ rootDir: dir, type: "unit-test-note", role: "dev", taskId, title: "Unit Tests" });

    const draftCheck = await checkHandoff({ rootDir: dir, fromRole: "dev", toRole: "qa", taskId });
    assert.equal(draftCheck.valid, false);
    assert.ok(draftCheck.errors.some((error) => error.includes("ready_for_review")));

    for (const artifactPath of [implementation.artifactPath, unit.artifactPath]) {
      const absolutePath = join(dir, artifactPath);
      const content = await readText(absolutePath);
      await writeFile(absolutePath, content.replace("status: draft", "status: ready_for_review"), "utf8");
    }

    const readyCheck = await checkHandoff({ rootDir: dir, fromRole: "dev", toRole: "qa", taskId });
    assert.equal(readyCheck.valid, true, `Errors: ${readyCheck.errors.join(", ")}`);
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
    assert.equal(json.context_budget.risk, "ok");
    assert.equal(json.context_budget.max_tokens, 100000);
  });

  test("rejects unknown package roles", async () => {
    await assert.rejects(
      () => buildContextPackage({ rootDir: dir, taskId: "TASK-200", role: "totallyfake" }),
      /Unknown role/
    );
  });

  test("reports warning, high, and split-recommended context budget risks", async () => {
    const warning = await buildContextPackage({ rootDir: dir, taskId: "TASK-200", role: "dev", format: "json", maxTokens: 120 });
    const warningJson = JSON.parse(await readText(join(dir, warning.packagePath)));
    assert.equal(warningJson.context_budget.risk, "warning");

    await createArtifact({ rootDir: dir, type: "sdd", taskId: "TASK-MULTI-BUDGET", title: "Budget SDD" });
    await createArtifact({ rootDir: dir, type: "adr", taskId: "TASK-MULTI-BUDGET", title: "Budget ADR" });
    await createArtifact({ rootDir: dir, type: "api-design", taskId: "TASK-MULTI-BUDGET", title: "Budget API" });
    const baseline = await buildContextPackage({ rootDir: dir, taskId: "TASK-MULTI-BUDGET", role: "dev", format: "json", maxTokens: 100000 });
    const baselineJson = JSON.parse(await readText(join(dir, baseline.packagePath)));
    const highMaxTokens = Math.ceil(baselineJson.context_budget.estimated_tokens / 1.3);
    const high = await buildContextPackage({ rootDir: dir, taskId: "TASK-MULTI-BUDGET", role: "dev", format: "json", maxTokens: highMaxTokens });
    const highJson = JSON.parse(await readText(join(dir, high.packagePath)));
    assert.equal(highJson.context_budget.risk, "high");

    const split = await buildContextPackage({ rootDir: dir, taskId: "TASK-200", role: "dev", format: "json", maxTokens: 40 });
    const splitJson = JSON.parse(await readText(join(dir, split.packagePath)));
    assert.equal(splitJson.context_budget.risk, "split_recommended");
    assert.equal(splitJson.context_budget.recommended_action, "split_phase_documents");
  });

  test("reports a single oversized artifact as split recommended", async () => {
    const result = await buildContextPackage({ rootDir: dir, taskId: "TASK-200", role: "dev", format: "json", maxTokens: 10 });
    const json = JSON.parse(await readText(join(dir, result.packagePath)));
    assert.equal(json.context_budget.risk, "split_recommended");
    assert.ok(json.context_budget.oversized_artifacts.some((artifact: { path: string }) => artifact.path.includes("SRS-TASK-200.md")));
  });

  test("loads context budget from acs.yaml and role overrides", async () => {
    const configuredDir = makeTempDir("acs-core-budget-config-");
    try {
      await initContextStore({ rootDir: configuredDir });
      await createArtifact({ rootDir: configuredDir, type: "srs", taskId: "TASK-BUDGET", title: "Budget SRS" });
      const acsPath = join(configuredDir, ".acs", "acs.yaml");
      const acs = await readText(acsPath);
      await writeFile(acsPath, acs.replace("  default_max_tokens: 100000", "  default_max_tokens: 40"), "utf8");

      const globalResult = await buildContextPackage({ rootDir: configuredDir, taskId: "TASK-BUDGET", role: "dev", format: "json" });
      const globalJson = JSON.parse(await readText(join(configuredDir, globalResult.packagePath)));
      assert.equal(globalJson.context_budget.max_tokens, 40);
      assert.equal(globalJson.context_budget.risk, "split_recommended");

      const rolePath = join(configuredDir, ".acs", "roles", "dev.yaml");
      const role = await readText(rolePath);
      await writeFile(rolePath, `${role}\ncontext_budget:\n  max_tokens: 200000\n`, "utf8");
      const roleResult = await buildContextPackage({ rootDir: configuredDir, taskId: "TASK-BUDGET", role: "dev", format: "json" });
      const roleJson = JSON.parse(await readText(join(configuredDir, roleResult.packagePath)));
      assert.equal(roleJson.context_budget.max_tokens, 200000);
      assert.equal(roleJson.context_budget.risk, "ok");

      const flagResult = await buildContextPackage({ rootDir: configuredDir, taskId: "TASK-BUDGET", role: "dev", format: "json", maxTokens: 60 });
      const flagJson = JSON.parse(await readText(join(configuredDir, flagResult.packagePath)));
      assert.equal(flagJson.context_budget.max_tokens, 60);
      assert.equal(flagJson.context_budget.risk, "split_recommended");
    } finally {
      await cleanupTempDir(configuredDir);
    }
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

// ─── buildSiteModel ───────────────────────────────────────────────────────────

describe("buildSiteModel", () => {
  let dir: string;

  before(async () => {
    dir = makeTempDir("acs-core-site-");
    await initContextStore({ rootDir: dir });
    await createArtifact({ rootDir: dir, type: "srs", taskId: "SITE-001", title: "Site SRS" });
    await createArtifact({ rootDir: dir, type: "sdd", taskId: "SITE-001", title: "Site SDD" });
    await createArtifact({ rootDir: dir, type: "srs", taskId: "SITE-002", title: "Second Task SRS" });
  });

  after(() => cleanupTempDir(dir));

  test("returns a SiteModel with required top-level keys", async () => {
    const model = await buildSiteModel(dir);
    assert.ok(typeof model.generatedAt === "string", "generatedAt should be a string");
    assert.ok(typeof model.store === "object" && model.store !== null, "store should be an object");
    assert.ok(Array.isArray(model.tasks), "tasks should be an array");
    assert.ok(Array.isArray(model.artifacts), "artifacts should be an array");
    assert.ok(Array.isArray(model.handoffs), "handoffs should be an array");
    assert.ok(typeof model.validation === "object" && model.validation !== null, "validation should be an object");
  });

  test("groups artifacts by frontmatter task_id, not directory name", async () => {
    const model = await buildSiteModel(dir);
    const task1 = model.tasks.find((t: SiteTask) => t.taskId === "SITE-001");
    const task2 = model.tasks.find((t: SiteTask) => t.taskId === "SITE-002");
    assert.ok(task1, "SITE-001 task should exist");
    assert.ok(task2, "SITE-002 task should exist");
    assert.equal(task1!.artifactCount, 2, "SITE-001 should have 2 artifacts");
    assert.equal(task2!.artifactCount, 1, "SITE-002 should have 1 artifact");
  });

  test("task includes artifacts, handoffs, timeline, and nextActionsByRole fields", async () => {
    const model = await buildSiteModel(dir);
    const task = model.tasks.find((t: SiteTask) => t.taskId === "SITE-001");
    assert.ok(task, "SITE-001 should exist");
    assert.ok(Array.isArray(task!.artifacts), "task.artifacts should be an array");
    assert.ok(Array.isArray(task!.handoffs), "task.handoffs should be an array");
    assert.ok(Array.isArray(task!.timeline), "task.timeline should be an array");
    assert.ok(typeof task!.nextActionsByRole === "object", "task.nextActionsByRole should be an object");
    assert.ok(typeof task!.kanbanState === "string", "task.kanbanState should be a string");
  });

  test("model artifacts list uses frontmatter task_id as source of truth", async () => {
    const model = await buildSiteModel(dir);
    for (const artifact of model.artifacts) {
      assert.ok(typeof artifact.taskId === "string", "artifact.taskId should be a string");
      assert.ok(artifact.taskId.length > 0, "artifact.taskId should not be empty");
    }
    const site001Artifacts = model.artifacts.filter((a: { taskId: string }) => a.taskId === "SITE-001");
    assert.equal(site001Artifacts.length, 2);
  });

  test("taskFilter limits results to the specified task", async () => {
    const model = await buildSiteModel(dir, "SITE-001");
    const taskIds = model.tasks.map((t: SiteTask) => t.taskId);
    assert.ok(taskIds.includes("SITE-001"), "filtered model should include SITE-001");
    assert.ok(!taskIds.includes("SITE-002"), "filtered model should not include SITE-002");
    const artifactTaskIds = new Set(model.artifacts.map((a: { taskId: string }) => a.taskId));
    assert.ok(!artifactTaskIds.has("SITE-002"), "filtered artifacts should not include SITE-002");
  });

  test("store field reflects resolved store info", async () => {
    const model = await buildSiteModel(dir);
    assert.ok(typeof model.store.storeDir === "string", "store.storeDir should be a string");
    assert.ok(typeof model.store.mode === "string", "store.mode should be a string");
  });

  test("validation result is included in model", async () => {
    const model = await buildSiteModel(dir);
    assert.ok(typeof model.validation.valid === "boolean", "validation.valid should be a boolean");
    assert.ok(Array.isArray(model.validation.errors), "validation.errors should be an array");
    assert.ok(Array.isArray(model.validation.warnings), "validation.warnings should be an array");
  });
});

// ─── deriveKanbanState ────────────────────────────────────────────────────────

describe("deriveKanbanState", () => {
  test("returns Entry when no roles have artifacts", () => {
    const state = deriveKanbanState({ rolesWithArtifacts: [], validationErrors: [], hasApprovedQaSignoff: false });
    assert.equal(state, "Entry");
  });

  test("returns BA when only BA has artifacts and no errors", () => {
    const state = deriveKanbanState({ rolesWithArtifacts: ["ba"], validationErrors: [], hasApprovedQaSignoff: false });
    assert.equal(state, "BA");
  });

  test("returns SA when SA has artifacts", () => {
    const state = deriveKanbanState({ rolesWithArtifacts: ["ba", "sa"], validationErrors: [], hasApprovedQaSignoff: false });
    assert.equal(state, "SA");
  });

  test("returns DEV when dev has artifacts", () => {
    const state = deriveKanbanState({ rolesWithArtifacts: ["ba", "sa", "dev"], validationErrors: [], hasApprovedQaSignoff: false });
    assert.equal(state, "DEV");
  });

  test("returns QA when qa has artifacts but no approved signoff", () => {
    const state = deriveKanbanState({ rolesWithArtifacts: ["ba", "sa", "dev", "qa"], validationErrors: [], hasApprovedQaSignoff: false });
    assert.equal(state, "QA");
  });

  test("returns Done when qa has artifacts and has approved signoff and no errors", () => {
    const state = deriveKanbanState({ rolesWithArtifacts: ["ba", "sa", "dev", "qa"], validationErrors: [], hasApprovedQaSignoff: true });
    assert.equal(state, "Done");
  });

  test("Blocked takes precedence over role-stage state when errors exist", () => {
    const state = deriveKanbanState({ rolesWithArtifacts: ["ba", "sa"], validationErrors: ["Missing required artifact"], hasApprovedQaSignoff: false });
    assert.equal(state, "Blocked");
  });

  test("Done requires no validation errors even with approved signoff", () => {
    const state = deriveKanbanState({ rolesWithArtifacts: ["ba", "sa", "dev", "qa"], validationErrors: ["Some error"], hasApprovedQaSignoff: true });
    assert.equal(state, "Blocked");
  });

  test("returns Entry when rolesWithArtifacts is empty even with errors", () => {
    const state = deriveKanbanState({ rolesWithArtifacts: [], validationErrors: ["Store missing dir"], hasApprovedQaSignoff: false });
    assert.equal(state, "Blocked");
  });

  test("returns Review when a handoff has pending approval and no errors", () => {
    const state = deriveKanbanState({ rolesWithArtifacts: ["ba", "sa"], validationErrors: [], hasApprovedQaSignoff: false, hasPendingHandoff: true });
    assert.equal(state, "Review");
  });

  test("Blocked takes precedence over Review", () => {
    const state = deriveKanbanState({ rolesWithArtifacts: ["ba"], validationErrors: ["Some error"], hasApprovedQaSignoff: false, hasPendingHandoff: true });
    assert.equal(state, "Blocked");
  });

  test("Done takes precedence over Review", () => {
    const state = deriveKanbanState({ rolesWithArtifacts: ["ba", "sa", "dev", "qa"], validationErrors: [], hasApprovedQaSignoff: true, hasPendingHandoff: true });
    assert.equal(state, "Done");
  });

  test("Review takes precedence over role-stage", () => {
    const state = deriveKanbanState({ rolesWithArtifacts: ["ba"], validationErrors: [], hasApprovedQaSignoff: false, hasPendingHandoff: true });
    assert.equal(state, "Review");
  });

  test("hasPendingHandoff false or absent does not trigger Review", () => {
    const state = deriveKanbanState({ rolesWithArtifacts: ["ba"], validationErrors: [], hasApprovedQaSignoff: false });
    assert.equal(state, "BA");
  });
});
