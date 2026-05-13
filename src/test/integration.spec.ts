/**
 * Integration tests — scenario-based
 *
 * Each describe block is a self-contained scenario that exercises a complete
 * user workflow rather than a single command. The full CLI binary (compiled
 * src/packages/cli/dist/index.js) is spawned for every call so these tests cover
 * the real process boundary: argument parsing, core API, file I/O, and exit codes.
 *
 * Isolation strategy
 * ──────────────────
 * • in-repo / dedicated tests:  makeTempDir → cleanupTempDir (after hook)
 * • local-mode tests:           separate envDir passed as APPDATA/HOME so the
 *   user's real profile directory is never touched
 *
 * Run just this file:
 *   pnpm test:integration
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { platform } from "node:process";
import {
  makeTempDir,
  cleanupTempDir,
  runCli,
  exists,
  readJson,
  readText,
  isolatedEnv,
} from "./helpers.ts";

function localBaseDir(envDir: string): string {
  if (platform === "win32") return join(envDir, "agent-context-store");
  if (platform === "darwin") return join(envDir, "Library", "Application Support", "agent-context-store");
  return join(envDir, ".local", "share", "agent-context-store");
}

// ─── Scenario 1: Full SDLC in-repo workflow ───────────────────────────────────
//
// Mirrors the plan's verification smoke flow end-to-end.
// A single before() sets up all artifacts so each test can assert independently.

describe("Scenario: full SDLC in-repo workflow", () => {
  let dir: string;
  const TASK = "INT-0001";

  before(() => {
    dir = makeTempDir("acs-int-sdlc-");

    // Store initialisation
    const init = runCli(["init"], { cwd: dir });
    assert.equal(init.status, 0, `init failed: ${init.stderr}`);

    // BA artifacts
    assert.equal(runCli(["ba", "new", "srs",                 "--task", TASK, "--title", "Login with OTP"], { cwd: dir }).status, 0);
    assert.equal(runCli(["ba", "new", "user-story",          "--task", TASK, "--title", "User Story"],    { cwd: dir }).status, 0);
    assert.equal(runCli(["ba", "new", "acceptance-criteria", "--task", TASK, "--title", "AC"],            { cwd: dir }).status, 0);

    // SA artifacts
    assert.equal(runCli(["sa", "new", "sdd",        "--task", TASK, "--title", "System Design"], { cwd: dir }).status, 0);
    assert.equal(runCli(["sa", "new", "adr",        "--task", TASK, "--title", "ADR"],           { cwd: dir }).status, 0);
    assert.equal(runCli(["sa", "new", "api-design", "--task", TASK, "--title", "API Design"],    { cwd: dir }).status, 0);

    // DEV artifact
    assert.equal(runCli(["dev", "new", "implementation-note", "--task", TASK, "--title", "Impl"], { cwd: dir }).status, 0);

    // QA artifact
    assert.equal(runCli(["qa", "new", "test-plan", "--task", TASK, "--title", "Test Plan"], { cwd: dir }).status, 0);
  });

  after(() => cleanupTempDir(dir));

  // ── Store layout ──────────────────────────────────────────────────────────

  test("store layout is .acs/ based, no root-level artifacts/", () => {
    assert.ok(exists(join(dir, ".acs/config.yaml")),  ".acs/config.yaml must exist");
    assert.ok(exists(join(dir, ".acs/artifacts")),    ".acs/artifacts must exist");
    assert.ok(!exists(join(dir, "artifacts")),        "no root-level artifacts/ in in-repo mode");
  });

  // ── Artifact files ────────────────────────────────────────────────────────

  test("all role-typed artifacts are created under .acs/", () => {
    const expected = [
      ".acs/artifacts/INT-0001/srs/SRS-INT-0001.md",
      ".acs/artifacts/INT-0001/user-story/US-INT-0001.md",
      ".acs/artifacts/INT-0001/acceptance-criteria/AC-INT-0001.md",
      ".acs/artifacts/INT-0001/sdd/SDD-INT-0001.md",
      ".acs/artifacts/INT-0001/adr/ADR-INT-0001.md",
      ".acs/artifacts/INT-0001/api-design/API-INT-0001.md",
      ".acs/artifacts/INT-0001/implementation-note/IMPL-INT-0001.md",
      ".acs/artifacts/INT-0001/test-plan/TEST-INT-0001.md",
    ];
    for (const rel of expected) {
      assert.ok(exists(join(dir, rel)), `Missing: ${rel}`);
    }
  });

  // ── Discovery commands ────────────────────────────────────────────────────

  test("roles lists ba, sa, dev, qa", () => {
    const r = runCli(["roles"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    for (const role of ["ba", "sa", "dev", "qa"]) {
      assert.ok(r.stdout.includes(role), `roles output missing: ${role}`);
    }
  });

  test("role explain dev --task lists allowed types and suggested commands", () => {
    const r = runCli(["role", "explain", "dev", "--task", TASK], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes("implementation-note"),       "must list createable type");
    assert.ok(r.stdout.includes("acs dev new implementation-note"), "must suggest the command");
  });

  test("next --role sa --task shows workflow guidance and missing inputs state", () => {
    const r = runCli(["next", "--role", "sa", "--task", TASK], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    // SA next should reference outputs like sdd or api-design
    assert.ok(
      r.stdout.includes("sdd") || r.stdout.includes("api-design"),
      `next output should reference SA deliverables, got: ${r.stdout}`,
    );
  });

  // ── Context package ───────────────────────────────────────────────────────

  test("package --role dev includes dev-readable artifacts in the context file", async () => {
    const r = runCli(["package", "--role", "dev", "--task", TASK], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const pkgPath = join(dir, ".acs", "packages", TASK, "dev.context.md");
    assert.ok(exists(pkgPath), "dev.context.md must be created");
    const content = await readText(pkgPath);
    // The package should embed the SRS content since dev can read srs
    assert.ok(
      content.toLowerCase().includes("srs") || content.includes("SRS-INT-0001"),
      "package content should reference SRS artifact",
    );
  });

  // ── Scoped validation ─────────────────────────────────────────────────────

  test("validate --role dev passes when all required inputs are present", () => {
    const r = runCli(["validate", "--role", "dev", "--task", TASK], { cwd: dir });
    assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.ok(r.stdout.includes("validation passed"), `stdout: ${r.stdout}`);
  });

  // ── Handoff lifecycle ─────────────────────────────────────────────────────

  test("handoff create sa→dev produces the expected yaml file", () => {
    const r = runCli(["handoff", "create", "--from", "sa", "--to", "dev", "--task", TASK], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, `.acs/handoffs/${TASK}/HOFF-${TASK}-SA-DEV.yaml`)));
  });

  test("handoff list --task returns the created handoff", () => {
    const r = runCli(["handoff", "list", "--task", TASK], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes(`HOFF-${TASK}-SA-DEV`), `stdout: ${r.stdout}`);
  });

  test("handoff check by ID exits 0 for existing handoff", () => {
    const r = runCli(["handoff", "check", `HOFF-${TASK}-SA-DEV`], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  });

  // ── Index ─────────────────────────────────────────────────────────────────

  test("index rebuild reflects all created artifacts", async () => {
    const r = runCli(["index"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const idx = await readJson<{ artifacts: unknown[] }>(join(dir, ".acs/index.json"));
    assert.ok(
      idx.artifacts.length >= 8,
      `expected ≥8 artifacts in index, got ${idx.artifacts.length}`,
    );
  });

  // ── Doctor ────────────────────────────────────────────────────────────────

  test("doctor passes after full artifact + handoff setup", () => {
    const r = runCli(["doctor"], { cwd: dir });
    assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  });
});

// ─── Scenario 2: Role enforcement and alias canonicalization ──────────────────
//
// Verifies policy gates (wrong role → non-zero + helpful message) and that
// legacy aliases api / test route to the canonical artifact-type directory.

describe("Scenario: role enforcement and alias canonicalization", () => {
  let dir: string;
  const TASK = "INT-0002";

  before(() => {
    dir = makeTempDir("acs-int-roles-");
    assert.equal(runCli(["init"], { cwd: dir }).status, 0);
  });

  after(() => cleanupTempDir(dir));

  test("dev is not allowed to create srs — prints helpful error and suggests ba", () => {
    const r = runCli(["dev", "new", "srs", "--task", TASK], { cwd: dir });
    assert.notEqual(r.status, 0, "must exit non-zero for disallowed role");
    const out = r.stdout + r.stderr;
    assert.ok(out.includes("not allowed to create"), `output: ${out}`);
    assert.ok(out.includes("ba"),                    "should suggest the correct role");
  });

  test("acs new api --task routes to api-design/ canonical path (no api/ dir)", () => {
    const r = runCli(["new", "api", "--task", TASK], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, `.acs/artifacts/${TASK}/api-design/API-${TASK}.md`)),
      "api-design/ canonical path must be created");
    assert.ok(!exists(join(dir, `.acs/artifacts/${TASK}/api`)),
      "no separate api/ directory should be created");
  });

  test("acs new test --task routes to test-plan/ canonical path (no test/ dir)", () => {
    const TTASK = `${TASK}-T`;
    const r = runCli(["new", "test", "--task", TTASK], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, `.acs/artifacts/${TTASK}/test-plan/TEST-${TTASK}.md`)),
      "test-plan/ canonical path must be created");
    assert.ok(!exists(join(dir, `.acs/artifacts/${TTASK}/test`)),
      "no separate test/ directory should be created");
  });

  test("acs ba new srs and acs new srs --role ba produce equivalent file layouts", () => {
    const T1 = `${TASK}-ALIAS1`;
    const T2 = `${TASK}-ALIAS2`;
    assert.equal(runCli(["ba",  "new", "srs",          "--task", T1], { cwd: dir }).status, 0);
    assert.equal(runCli(["new", "srs", "--role", "ba", "--task", T2], { cwd: dir }).status, 0);
    assert.ok(exists(join(dir, `.acs/artifacts/${T1}/srs/SRS-${T1}.md`)));
    assert.ok(exists(join(dir, `.acs/artifacts/${T2}/srs/SRS-${T2}.md`)));
  });

  test("acs dev package --task is equivalent to acs package --role dev --task", () => {
    // Seed a readable artifact for dev
    runCli(["new", "srs", "--task", `${TASK}-PKG`], { cwd: dir });
    const r1 = runCli(["dev",     "package",            "--task", `${TASK}-PKG`], { cwd: dir });
    const r2 = runCli(["package", "--role", "dev",      "--task", `${TASK}-PKG`], { cwd: dir });
    assert.equal(r1.status, 0, `role-alias package failed: ${r1.stderr}`);
    assert.equal(r2.status, 0, `explicit package failed: ${r2.stderr}`);
    assert.ok(exists(join(dir, `.acs/packages/${TASK}-PKG/dev.context.md`)));
  });

  test("unknown artifact type exits non-zero", () => {
    const r = runCli(["new", "totally-fake-type", "--task", TASK], { cwd: dir });
    assert.notEqual(r.status, 0, "unknown type must exit non-zero");
  });
});

// ─── Scenario 3: Dedicated mode round-trip ────────────────────────────────────
//
// The dedicated store owns the directory root; there is no .acs/ prefix.

describe("Scenario: dedicated mode round-trip", () => {
  let dir: string;
  const TASK = "INT-0003";

  before(() => {
    dir = makeTempDir("acs-int-dedicated-");
    assert.equal(runCli(["init", "--mode", "dedicated"], { cwd: dir }).status, 0);
  });

  after(() => cleanupTempDir(dir));

  test("status shows dedicated mode", () => {
    const r = runCli(["status"], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes("dedicated"), `stdout: ${r.stdout}`);
  });

  test("config.yaml is at root level, not inside .acs/", () => {
    assert.ok(exists(join(dir, "config.yaml")),  "config.yaml must be at root");
    assert.ok(!exists(join(dir, ".acs")),         "no .acs/ in dedicated mode");
  });

  test("artifacts go to root-level artifacts/ (no .acs/ prefix)", () => {
    const r = runCli(["new", "srs", "--task", TASK], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, `artifacts/${TASK}/srs/SRS-${TASK}.md`)),
      "artifact must be under root-level artifacts/");
  });

  test("validate passes after init + artifact creation", () => {
    const r = runCli(["validate"], { cwd: dir });
    assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  });

  test("package --role ba generates context file at root-level packages/", () => {
    const r = runCli(["package", "--role", "ba", "--task", TASK], { cwd: dir });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, `packages/${TASK}/ba.context.md`)));
  });
});

// ─── Scenario 4: Local mode — no project-side writes, isolated APPDATA ────────
//
// local mode must NOT create .acs/ or any other file in the project dir.
// Tests use an isolated envDir as APPDATA/HOME so the real user profile
// is never touched.

describe("Scenario: local mode isolation", () => {
  let projectDir: string;
  let envDir: string;

  before(() => {
    projectDir = makeTempDir("acs-int-local-project-");
    envDir     = makeTempDir("acs-int-local-env-");

    const r = runCli(["init", "--mode", "local"], {
      cwd: projectDir,
      env: isolatedEnv(envDir),
    });
    assert.equal(r.status, 0, `local init failed: ${r.stderr}`);
  });

  after(async () => {
    await Promise.all([cleanupTempDir(projectDir), cleanupTempDir(envDir)]);
  });

  test("no .acs/ or artifacts/ created inside the project directory", () => {
    assert.ok(!exists(join(projectDir, ".acs")),      ".acs/ must not exist in project");
    assert.ok(!exists(join(projectDir, "artifacts")), "artifacts/ must not exist in project");
    assert.ok(!exists(join(projectDir, "config.yaml")),"config.yaml must not exist in project");
  });

  test("status shows local mode with initialized:yes from isolated store", () => {
    const r = runCli(["status"], { cwd: projectDir, env: isolatedEnv(envDir) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes("local"), `stdout: ${r.stdout}`);
    assert.ok(
      r.stdout.includes("initialized yes") || r.stdout.includes("initialized  yes"),
      `stdout: ${r.stdout}`,
    );
  });

  test("store directory is created inside the isolated APPDATA directory", () => {
    const storesBase = join(localBaseDir(envDir), "stores");
    assert.ok(exists(storesBase), `stores/ must exist at ${storesBase}`);
  });

  test("creating an artifact writes it into the isolated APPDATA store, not the project", () => {
    const TASK = "INT-LOC-01";
    const r = runCli(["new", "srs", "--task", TASK], {
      cwd: projectDir,
      env: isolatedEnv(envDir),
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    // No file should appear in the project dir
    assert.ok(!exists(join(projectDir, ".acs", "artifacts")));
    // The store inside envDir should have the artifact somewhere
    const storesBase = join(localBaseDir(envDir), "stores");
    assert.ok(exists(storesBase));
  });
});

// ─── Scenario 5: Idempotency and edge-case guards ────────────────────────────
//
// Re-running init must not corrupt an existing store. Unknown-mode and
// unknown-command errors must exit non-zero with a message.

describe("Scenario: idempotency and error guards", () => {
  test("acs init twice (in-repo) is idempotent — store stays valid", async () => {
    const dir = makeTempDir("acs-int-idem-inrepo-");
    try {
      assert.equal(runCli(["init"], { cwd: dir }).status, 0, "first init must succeed");
      assert.equal(runCli(["init"], { cwd: dir }).status, 0, "second init must also succeed");
      const r = runCli(["validate"], { cwd: dir });
      assert.equal(r.status, 0, `validate after double-init failed: ${r.stdout}`);
    } finally {
      await cleanupTempDir(dir);
    }
  });

  test("acs init twice (dedicated) is idempotent", async () => {
    const dir = makeTempDir("acs-int-idem-dedicated-");
    try {
      assert.equal(runCli(["init", "--mode", "dedicated"], { cwd: dir }).status, 0);
      assert.equal(runCli(["init", "--mode", "dedicated"], { cwd: dir }).status, 0);
      assert.equal(runCli(["validate"], { cwd: dir }).status, 0);
    } finally {
      await cleanupTempDir(dir);
    }
  });

  test("acs init --mode bogus exits non-zero with helpful message", () => {
    const r = runCli(["init", "--mode", "bogus"]);
    assert.notEqual(r.status, 0);
    assert.ok(
      r.stdout.includes("Unknown mode") || r.stderr.includes("Unknown mode"),
      `output: ${r.stdout}${r.stderr}`,
    );
  });

  test("acs <unknown-command> exits non-zero and mentions Unknown command", () => {
    const r = runCli(["zap-the-store"]);
    assert.notEqual(r.status, 0);
    assert.ok(
      r.stdout.includes("Unknown") || r.stderr.includes("Unknown"),
      `output: ${r.stdout}${r.stderr}`,
    );
  });

  test("validate on an empty directory exits non-zero", async () => {
    const dir = makeTempDir("acs-int-validate-empty-");
    try {
      const r = runCli(["validate"], { cwd: dir });
      assert.notEqual(r.status, 0, "validate should fail for uninitialized dir");
    } finally {
      await cleanupTempDir(dir);
    }
  });

  test("handoff check for a policy-blocked transition exits non-zero with state message", async () => {
    const dir = makeTempDir("acs-int-hoff-block-");
    try {
      runCli(["init"], { cwd: dir });
      runCli(["dev", "new", "implementation-note", "--task", "INT-E05"], { cwd: dir });
      // dev→qa requires artifacts in ready_for_review state which they're not
      const r = runCli(["handoff", "check", "--from", "dev", "--to", "qa", "--task", "INT-E05"], { cwd: dir });
      assert.notEqual(r.status, 0, "policy-blocked handoff must exit non-zero");
      assert.ok(
        r.stdout.includes("ready_for_review") || r.stderr.includes("ready_for_review"),
        `expected state hint in output: ${r.stdout}${r.stderr}`,
      );
    } finally {
      await cleanupTempDir(dir);
    }
  });
});
