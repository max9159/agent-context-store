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
    assert.ok(exists(join(home, ".cursor/AGENTS.md")), "AGENTS.md missing from ~/.cursor");
    assert.ok(exists(join(home, ".cursor/skills/agent-context-store/SKILL.md")), "SKILL.md missing from user dir");
  });

  test("~/.cursor/AGENTS.md references the correct .cursor/skills/ path", async () => {
    const content = await readText(join(home, ".cursor/AGENTS.md"));
    assert.ok(
      content.includes(".cursor/skills/agent-context-store/SKILL.md"),
      `Expected '.cursor/skills/agent-context-store/SKILL.md' in ~/.cursor/AGENTS.md but got:\n${content}`
    );
    assert.ok(
      !content.includes(".agents/skills/"),
      `Found wrong '.agents/skills/' path in ~/.cursor/AGENTS.md`
    );
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
    assert.ok(exists(join(home, ".claude/CLAUDE.md")), "CLAUDE.md missing from ~/.claude");
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
    assert.ok(exists(join(home, ".codex/AGENTS.md")), "AGENTS.md missing from ~/.codex");
    assert.ok(exists(join(home, ".codex/skills/agent-context-store/SKILL.md")), "SKILL.md missing from user dir");
  });

  test("~/.codex/AGENTS.md references the correct .codex/skills/ path", async () => {
    const content = await readText(join(home, ".codex/AGENTS.md"));
    assert.ok(
      content.includes(".codex/skills/agent-context-store/SKILL.md"),
      `Expected '.codex/skills/agent-context-store/SKILL.md' in ~/.codex/AGENTS.md but got:\n${content}`
    );
    assert.ok(
      !content.includes(".agents/skills/"),
      `Found wrong '.agents/skills/' path in ~/.codex/AGENTS.md`
    );
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

  test("creates dotdir config files for all agents", () => {
    assert.ok(exists(join(home, ".cursor/AGENTS.md")), "~/.cursor/AGENTS.md missing");
    assert.ok(exists(join(home, ".claude/CLAUDE.md")), "~/.claude/CLAUDE.md missing");
    assert.ok(exists(join(home, ".codex/AGENTS.md")), "~/.codex/AGENTS.md missing");
  });

  test("AGENTS.md written to ~/.cursor and ~/.codex (not duplicated within each)", async () => {
    const cursorContent = await readText(join(home, ".cursor/AGENTS.md"));
    const codexContent = await readText(join(home, ".codex/AGENTS.md"));
    const cursorOccurrences = cursorContent.split("# Agent Context Store Instructions").length - 1;
    const codexOccurrences = codexContent.split("# Agent Context Store Instructions").length - 1;
    assert.equal(cursorOccurrences, 1, `~/.cursor/AGENTS.md duplicated content (${cursorOccurrences} occurrences)`);
    assert.equal(codexOccurrences, 1, `~/.codex/AGENTS.md duplicated content (${codexOccurrences} occurrences)`);
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
    await mkdir(join(home, ".cursor"), { recursive: true });
    await writeFile(join(home, ".cursor/AGENTS.md"), "# Existing Content\n", "utf8");
  });
  after(() => { cleanupTempDir(dir); cleanupTempDir(home); });

  test("appends to ~/.cursor/AGENTS.md rather than replacing it", async () => {
    runCli(["install-skills", "--agent", "cursor"], { cwd: dir, env: isolatedEnv(home) });
    const content = await readText(join(home, ".cursor/AGENTS.md"));
    assert.ok(content.includes("# Existing Content"), "Existing content was lost");
    assert.ok(content.length > "# Existing Content\n".length, "Nothing was appended");
  });
});

describe("install-skills CLAUDE.md append behavior", () => {
  let dir: string;
  let home: string;
  before(async () => {
    dir = makeTempDir("acs-is-claude-append-");
    home = makeTempDir("acs-is-claude-append-home-");
    await mkdir(join(home, ".claude"), { recursive: true });
    await writeFile(join(home, ".claude/CLAUDE.md"), "# Existing Content\n", "utf8");
  });
  after(() => { cleanupTempDir(dir); cleanupTempDir(home); });

  test("appends to ~/.claude/CLAUDE.md rather than replacing it", async () => {
    runCli(["install-skills", "--agent", "claude"], { cwd: dir, env: isolatedEnv(home) });
    const content = await readText(join(home, ".claude/CLAUDE.md"));
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
