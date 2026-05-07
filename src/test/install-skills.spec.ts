import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { makeTempDir, cleanupTempDir, runCli, exists, readText, isolatedEnv } from "./helpers.ts";

// ─── Missing / invalid --agent ────────────────────────────────────────────────

describe("install-skills - missing --agent", () => {
  test("exits non-zero and lists valid agents", () => {
    const dir = makeTempDir("acs-is-missing-");
    const r = runCli(["install-skills"], { cwd: dir });
    cleanupTempDir(dir);
    assert.notEqual(r.status, 0);
    const out = r.stdout + r.stderr;
    assert.ok(out.includes("cursor") && out.includes("claude") && out.includes("codex"));
  });
});

describe("install-skills - unknown --agent", () => {
  test("exits non-zero for an unknown agent name", () => {
    const dir = makeTempDir("acs-is-unknown-");
    const r = runCli(["install-skills", "--agent", "ghost-agent"], { cwd: dir });
    cleanupTempDir(dir);
    assert.notEqual(r.status, 0);
    assert.ok((r.stdout + r.stderr).toLowerCase().includes("unknown") || (r.stdout + r.stderr).toLowerCase().includes("invalid"));
  });
});

// ─── Per-agent installs ───────────────────────────────────────────────────────

describe("install-skills --agent cursor", () => {
  let dir: string;
  let home: string;
  before(() => {
    dir = makeTempDir("acs-is-cursor-");
    home = makeTempDir("acs-is-cursor-home-");
  });
  after(() => { cleanupTempDir(dir); cleanupTempDir(home); });

  test("exits 0 and creates expected files", () => {
    const r = runCli(["install-skills", "--agent", "cursor"], { cwd: dir, env: isolatedEnv(home) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, "AGENTS.md")), "AGENTS.md missing from project dir");
    assert.ok(exists(join(home, ".cursor/skills/agent-context-store/SKILL.md")), "SKILL.md missing from user dir");
  });
});

describe("install-skills --agent claude", () => {
  let dir: string;
  let home: string;
  before(() => {
    dir = makeTempDir("acs-is-claude-");
    home = makeTempDir("acs-is-claude-home-");
  });
  after(() => { cleanupTempDir(dir); cleanupTempDir(home); });

  test("exits 0 and creates expected files", () => {
    const r = runCli(["install-skills", "--agent", "claude"], { cwd: dir, env: isolatedEnv(home) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, "CLAUDE.md")), "CLAUDE.md missing from project dir");
    assert.ok(exists(join(home, ".claude/skills/agent-context-store/SKILL.md")), "SKILL.md missing from user dir");
  });
});

describe("install-skills --agent codex", () => {
  let dir: string;
  let home: string;
  before(() => {
    dir = makeTempDir("acs-is-codex-");
    home = makeTempDir("acs-is-codex-home-");
  });
  after(() => { cleanupTempDir(dir); cleanupTempDir(home); });

  test("exits 0 and creates expected files", () => {
    const r = runCli(["install-skills", "--agent", "codex"], { cwd: dir, env: isolatedEnv(home) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(dir, "AGENTS.md")), "AGENTS.md missing from project dir");
    assert.ok(exists(join(home, ".codex/skills/agent-context-store/SKILL.md")), "SKILL.md missing from user dir");
  });
});

describe("install-skills --agent openclaw", () => {
  test("exits 0 and prints warning only (no skill files yet)", () => {
    const dir = makeTempDir("acs-is-openclaw-");
    const r = runCli(["install-skills", "--agent", "openclaw"], { cwd: dir });
    cleanupTempDir(dir);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = r.stdout + r.stderr;
    assert.ok(out.toLowerCase().includes("warn") || out.toLowerCase().includes("not yet") || out.toLowerCase().includes("openclaw"));
  });
});

// ─── --agent all ──────────────────────────────────────────────────────────────

describe("install-skills --agent all", () => {
  let dir: string;
  let home: string;
  before(() => {
    dir = makeTempDir("acs-is-all-");
    home = makeTempDir("acs-is-all-home-");
  });
  after(() => { cleanupTempDir(dir); cleanupTempDir(home); });

  test("creates skill files for cursor, claude, and codex", () => {
    const r = runCli(["install-skills", "--agent", "all"], { cwd: dir, env: isolatedEnv(home) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(exists(join(home, ".cursor/skills/agent-context-store/SKILL.md")));
    assert.ok(exists(join(home, ".claude/skills/agent-context-store/SKILL.md")));
    assert.ok(exists(join(home, ".codex/skills/agent-context-store/SKILL.md")));
  });

  test("AGENTS.md is appended only once for a single run", async () => {
    const content = await readText(join(dir, "AGENTS.md"));
    const occurrences = content.split("# Agent Context Store Instructions").length - 1;
    assert.ok(occurrences === 1, `AGENTS.md duplicated content (${occurrences} occurrences)`);
  });
});

// ─── Replace vs append behavior ───────────────────────────────────────────────

describe("install-skills skill file replacement", () => {
  let dir: string;
  let home: string;
  before(async () => {
    dir = makeTempDir("acs-is-replace-");
    home = makeTempDir("acs-is-replace-home-");
    const skillDir = join(home, ".cursor/skills/agent-context-store");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "STALE CONTENT", "utf8");
  });
  after(() => { cleanupTempDir(dir); cleanupTempDir(home); });

  test("replaces existing skill file with bundled content", async () => {
    runCli(["install-skills", "--agent", "cursor"], { cwd: dir, env: isolatedEnv(home) });
    const content = await readText(join(home, ".cursor/skills/agent-context-store/SKILL.md"));
    assert.ok(!content.includes("STALE CONTENT"), "Stale content was not replaced");
  });
});

describe("install-skills AGENTS.md append behavior", () => {
  let dir: string;
  let home: string;
  before(async () => {
    dir = makeTempDir("acs-is-append-");
    home = makeTempDir("acs-is-append-home-");
    await writeFile(join(dir, "AGENTS.md"), "# Existing Content\n", "utf8");
  });
  after(() => { cleanupTempDir(dir); cleanupTempDir(home); });

  test("appends to AGENTS.md rather than replacing it", async () => {
    runCli(["install-skills", "--agent", "cursor"], { cwd: dir, env: isolatedEnv(home) });
    const content = await readText(join(dir, "AGENTS.md"));
    assert.ok(content.includes("# Existing Content"), "Existing content was lost");
    assert.ok(content.length > "# Existing Content\n".length, "Nothing was appended");
  });
});

// ─── Deprecated alias ─────────────────────────────────────────────────────────

describe("install-agent-config (deprecated alias)", () => {
  let dir: string;
  let home: string;
  before(() => {
    dir = makeTempDir("acs-is-alias-");
    home = makeTempDir("acs-is-alias-home-");
  });
  after(() => { cleanupTempDir(dir); cleanupTempDir(home); });

  test("still works and prints deprecation warning", () => {
    const r = runCli(["install-agent-config"], { cwd: dir, env: isolatedEnv(home) });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = r.stdout + r.stderr;
    assert.ok(
      out.toLowerCase().includes("deprecated") || out.toLowerCase().includes("warning"),
      `Expected deprecation notice in output: ${out}`
    );
  });
});
