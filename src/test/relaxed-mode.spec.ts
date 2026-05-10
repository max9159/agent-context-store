import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { withTempProject, runCli, initStore } from "./helpers.ts";

test("acs status reports tasks with no artifacts as entry-eligible", async () => {
  await withTempProject("acs-relaxed-status-", async (dir) => {
    assert.equal(initStore(dir).status, 0);
    const status = runCli(["status"], { cwd: dir });
    assert.equal(status.status, 0, status.stderr);
    // No tasks yet; status should hint at relaxed entry mode.
    assert.match(status.stdout, /Tasks: \(none yet/);
  });
});

test("strict validate fails when SA starts without BA artifacts", async () => {
  await withTempProject("acs-strict-sa-", async (dir) => {
    assert.equal(initStore(dir).status, 0);
    assert.equal(runCli(["sa", "new", "sdd", "--task", "TASK-1", "--title", "x"], { cwd: dir }).status, 0);
    const validate = runCli(["validate", "--role", "sa", "--task", "TASK-1"], { cwd: dir });
    assert.equal(validate.status, 1);
    assert.match(validate.stderr + validate.stdout, /Missing required input/);
  });
});

test("relaxed validate downgrades missing upstream to warnings + hints", async () => {
  await withTempProject("acs-relaxed-sa-", async (dir) => {
    assert.equal(initStore(dir).status, 0);
    assert.equal(runCli(["sa", "new", "sdd", "--task", "TASK-1", "--title", "x"], { cwd: dir }).status, 0);
    const validate = runCli(["validate", "--role", "sa", "--task", "TASK-1", "--mode", "relaxed"], { cwd: dir });
    assert.equal(validate.status, 0, validate.stderr);
    assert.match(validate.stdout, /mode relaxed/);
    assert.match(validate.stdout, /Hints \(for AI agents\)/);
    assert.match(validate.stdout, /system --to sa/);
  });
});

test("system->sa entry handoff is accepted in relaxed mode", async () => {
  await withTempProject("acs-system-sa-", async (dir) => {
    assert.equal(initStore(dir).status, 0);
    const create = runCli(
      ["handoff", "create", "--from", "system", "--to", "sa", "--task", "TASK-1", "--mode", "relaxed"],
      { cwd: dir }
    );
    assert.equal(create.status, 0, create.stderr);
    assert.match(create.stdout, /system->sa/);
  });
});

test("end-to-end SA entry: handoff + create + relaxed validate passes", async () => {
  await withTempProject("acs-sa-e2e-", async (dir) => {
    assert.equal(initStore(dir).status, 0);
    assert.equal(
      runCli(["handoff", "create", "--from", "system", "--to", "sa", "--task", "TASK-9", "--mode", "relaxed"], { cwd: dir }).status,
      0
    );
    assert.equal(runCli(["sa", "new", "sdd", "--task", "TASK-9", "--title", "x"], { cwd: dir }).status, 0);
    const validate = runCli(["validate", "--role", "sa", "--task", "TASK-9", "--mode", "relaxed"], { cwd: dir });
    assert.equal(validate.status, 0, validate.stdout + validate.stderr);
    assert.match(validate.stdout, /OK validation passed/);
  });
});

test("strict skip-role error suggests system entry handoff", async () => {
  await withTempProject("acs-skip-error-", async (dir) => {
    assert.equal(initStore(dir).status, 0);
    const check = runCli(
      ["handoff", "check", "--from", "ba", "--to", "dev", "--task", "TASK-1"],
      { cwd: dir }
    );
    assert.equal(check.status, 1);
    const out = check.stdout + check.stderr;
    assert.match(out, /No handoff rule configured for ba -> dev/);
    assert.match(out, /system --to dev/);
  });
});

test("per-task JSONL working log captures structured events", async () => {
  await withTempProject("acs-jsonl-log-", async (dir) => {
    assert.equal(initStore(dir).status, 0);
    assert.equal(runCli(["sa", "new", "sdd", "--task", "TASK-7", "--title", "x"], { cwd: dir }).status, 0);
    const taskLogPath = join(dir, ".acs", "audit", "tasks", "TASK-7.jsonl");
    assert.equal(existsSync(taskLogPath), true, "per-task jsonl missing");
    const lines = readFileSync(taskLogPath, "utf8").trim().split("\n");
    assert.equal(lines.length >= 1, true);
    const ev = JSON.parse(lines[0]!);
    assert.equal(ev.action, "artifact.create");
    assert.equal(ev.task_id, "TASK-7");
    assert.equal(typeof ev.ts, "string");
    assert.equal(typeof ev.session_id, "string");

    const read = runCli(["log", "--task", "TASK-7", "--json"], { cwd: dir });
    assert.equal(read.status, 0, read.stderr);
    const events = JSON.parse(read.stdout);
    assert.equal(Array.isArray(events), true);
    assert.equal(events.length >= 1, true);
  });
});

test("daily audit log is JSONL and survives concurrent appends", async () => {
  await withTempProject("acs-audit-concurrent-", async (dir) => {
    assert.equal(initStore(dir).status, 0);
    // Fire 10 artifact creations in parallel — appendFile must not lose lines.
    const creates = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        Promise.resolve(runCli(["sa", "new", "adr", "--task", `T-${i}`, "--title", "z"], { cwd: dir }))
      )
    );
    for (const c of creates) assert.equal(c.status, 0, c.stderr);
    // Find today's log file
    const auditDir = join(dir, ".acs", "audit");
    const today = new Date().toISOString().slice(0, 10);
    const dailyLog = join(auditDir, `${today}.log`);
    const lines = readFileSync(dailyLog, "utf8").trim().split("\n").filter(Boolean);
    // Each create appends one line; concurrent runs must not truncate.
    assert.equal(lines.length, 10, `expected 10 audit lines, got ${lines.length}`);
    for (const line of lines) {
      const ev = JSON.parse(line);
      assert.equal(ev.action, "artifact.create");
    }
  });
});
