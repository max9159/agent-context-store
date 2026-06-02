#!/usr/bin/env node
import { appendFile, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { select, checkbox, input, confirm } from "@inquirer/prompts";
import {
  buildContextPackage,
  buildIndex,
  buildSiteModel,
  checkHandoff,
  createArtifact,
  createHandoff,
  doctor,
  explainRole,
  getNextActions,
  getStoreInfo,
  getTasksOverview,
  initContextStore,
  linkContextStore,
  listHandoffs,
  listRoles,
  readTaskLog,
  validatePolicyScope,
  type AcsHint,
  type AcsMode,
  type StoreMode
} from "agent-context-store-core";

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

const validModes: StoreMode[] = ["in-repo", "local", "dedicated"];
const validAcsModes: AcsMode[] = ["strict", "relaxed"];

function ensureSessionId(): void {
  if (!process.env["ACS_SESSION_ID"]) {
    process.env["ACS_SESSION_ID"] = `cli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function getAcsMode(args: ParsedArgs, fallback: AcsMode = "strict"): AcsMode {
  const raw = getStringFlag(args, "mode");
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  if ((validAcsModes as string[]).includes(normalized)) return normalized as AcsMode;
  // "strict"/"relaxed" only — store-mode --mode is parsed in `init` separately.
  throw new Error(`Unknown --mode "${raw}". Expected one of: ${validAcsModes.join(", ")}`);
}

const require = createRequire(import.meta.url);
const cliPackage = require("../package.json") as { version?: string };

type AgentName = "cursor" | "claude" | "codex" | "openclaw" | "all";

const VALID_AGENTS: AgentName[] = ["cursor", "claude", "codex", "openclaw", "all"];

interface AgentConfigFile {
  source: string;
  target: string;
  mode: "append" | "replace";
}

const ROLE_SKILLS = ["agent-context-store", "acs-ba", "acs-sa", "acs-dev", "acs-qa"] as const;

// User-level dotdir config files installed into ~/.cursor, ~/.claude, ~/.codex
const agentDotdirFiles: Record<Exclude<AgentName, "openclaw" | "all">, AgentConfigFile[]> = {
  cursor: [{ source: "AGENTS-cursor.md", target: "AGENTS.md", mode: "append" }],
  claude: [{ source: "CLAUDE.md", target: "CLAUDE.md", mode: "append" }],
  codex: [{ source: "AGENTS.md", target: "AGENTS.md", mode: "append" }],
};

// User-level dotdir names: skills go to ~/<dir>/skills/
const agentSkillDirName: Record<Exclude<AgentName, "openclaw" | "all">, string> = {
  cursor: ".cursor",
  claude: ".claude",
  codex: ".codex",
};

function getUserSkillsDir(agent: Exclude<AgentName, "openclaw" | "all">): string {
  return path.join(os.homedir(), agentSkillDirName[agent], "skills");
}

async function main(argv: string[]): Promise<void> {
  ensureSessionId();
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(`acs ${cliPackage.version ?? "0.0.0"}`);
    return;
  }

  if (await isRoleCommand(command)) {
    await handleRoleCommand(command, rest);
    return;
  }

  if (command === "init") {
    const args = parseArgs(rest);
    const modeArg = getStringFlag(args, "mode");
    const pathArg = String(args.positional[0] ?? args.flags["path"] ?? "");

    if (modeArg && !(validModes as string[]).includes(modeArg)) {
      console.error(`ERROR Unknown mode "${modeArg}". Expected one of: ${validModes.join(", ")}`);
      process.exitCode = 1;
      return;
    }

    // Non-interactive path: --mode provided, or stdin is not a TTY
    const isNonInteractive = (!!modeArg && (modeArg !== "dedicated" || !!pathArg)) || !process.stdin.isTTY;
    if (isNonInteractive) {
      const rootDir = pathArg || process.cwd();
      const mode = (modeArg as StoreMode) ?? "in-repo";
      // For dedicated mode with an explicit path, record the caller's cwd as
      // the project dir so a .acs/config.yaml pointer is written there.
      const projectDir = (mode === "dedicated" && pathArg) ? process.cwd() : undefined;
      const result = await initContextStore({ rootDir, mode, projectDir });
      const label = modeArg ? `Initialized context store (mode: ${mode})` : "Initialized context store";
      printResult(label, result);
      return;
    }

    // Interactive wizard
    await runInitWizard();
    return;
  }

  if (command === "link") {
    const args = parseArgs(rest);
    const storePath = String(args.positional[0] ?? "");
    if (!storePath) {
      console.error("ERROR Missing existing store path. Usage: acs link <existing_store_path> [--path <project_path>] [--force]");
      process.exitCode = 1;
      return;
    }
    const projectPath = getStringFlag(args, "path") ?? process.cwd();
    const result = await linkContextStore({ projectDir: projectPath, storeDir: storePath, force: !!args.flags["force"] });
    printResult("Linked project to existing context store", result);
    return;
  }

  if (command === "status") {
    const info = await getStoreInfo(process.cwd());
    console.log(`mode        ${info.mode}`);
    console.log(`store       ${info.storeDir}`);
    console.log(`policy      ${info.policyPath ?? "unknown"}`);
    console.log(`initialized ${info.initialized ? "yes" : "no"}`);
    console.log(`config      ${info.configPresent ? "yes" : "no"}`);
    console.log(`schemas     ${info.schemasPresent ? "yes" : "no"}`);
    if (info.initialized) {
      const validation = await doctor(process.cwd());
      console.log(`artifacts   ${validation.artifacts.length}`);
      console.log(`handoffs    ${validation.handoffs.length}`);
      console.log(`valid       ${validation.valid ? "yes" : "no"}`);
      const overview = await getTasksOverview(process.cwd());
      if (overview.length > 0) {
        console.log("");
        console.log("Tasks:");
        for (const task of overview) {
          const roles = task.rolesWithArtifacts.length > 0 ? task.rolesWithArtifacts.join(",") : "-";
          const next = task.isEntry ? "any (relaxed)" : task.suggestedNextRole;
          console.log(`  ${task.taskId}  artifacts=${task.artifactCount}  roles-with-artifacts=[${roles}]  suggested-next=${next}`);
        }
      } else {
        console.log("");
        console.log("Tasks: (none yet — any role may be the entry; use --mode relaxed)");
      }
    }
    return;
  }

  if (command === "new") {
    await handleNewArtifact(rest);
    return;
  }

  if (command === "validate") {
    const args = parseArgs(rest);
    const role = getStringFlag(args, "role");
    const taskId = getStringFlag(args, "task");
    const artifact = getStringFlag(args, "artifact");
    const mode = getAcsMode(args);
    const validation = role || taskId || artifact
      ? await validatePolicyScope({ rootDir: process.cwd(), role, taskId, artifactPath: artifact, mode })
      : await doctor(process.cwd());
    if (role) {
      console.log(`role ${role}`);
    }
    if (taskId) {
      console.log(`task ${taskId}`);
    }
    if (artifact) {
      console.log(`artifact ${artifact}`);
    }
    if (role || taskId || artifact) {
      console.log(`mode ${mode}`);
    }
    printValidation(validation);
    if (!validation.valid) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "log") {
    const args = parseArgs(rest);
    const taskId = requireFlag(args, "task");
    const tail = getStringFlag(args, "tail");
    const tailNum = tail ? Number.parseInt(tail, 10) : undefined;
    const asJson = !!args.flags["json"];
    const events = await readTaskLog({ rootDir: process.cwd(), taskId, tail: Number.isFinite(tailNum) ? tailNum : undefined });
    if (asJson) {
      console.log(JSON.stringify(events, null, 2));
      return;
    }
    if (events.length === 0) {
      console.log(`(no events for ${taskId})`);
      return;
    }
    for (const ev of events) {
      const parts = [ev.ts, ev.action];
      if (ev.role) parts.push(`role=${ev.role}`);
      if (ev.from && ev.to) parts.push(`${ev.from}->${ev.to}`);
      if (ev.artifact) parts.push(`artifact=${ev.artifact}`);
      if (ev.handoff) parts.push(`handoff=${ev.handoff}`);
      if (ev.mode) parts.push(`mode=${ev.mode}`);
      if (ev.session_id) parts.push(`session=${ev.session_id}`);
      console.log(parts.join("  "));
    }
    return;
  }

  if (command === "handoff") {
    await handleHandoff(rest);
    return;
  }

  if (command === "package") {
    await handlePackage(rest);
    return;
  }

  if (command === "roles") {
    const roles = await listRoles(process.cwd());
    for (const role of roles) {
      console.log(`${role.role}\t${role.displayName}`);
    }
    return;
  }

  if (command === "role") {
    const [action, role, ...tail] = rest;
    if (action !== "explain" || !role) {
      throw new Error('Unknown role action. Expected "role explain <ROLE>".');
    }
    const args = parseArgs(tail);
    printRoleExplanation(await explainRole({ rootDir: process.cwd(), role, taskId: getStringFlag(args, "task") }));
    return;
  }

  if (command === "next") {
    const args = parseArgs(rest);
    const role = requireFlag(args, "role");
    const taskId = requireFlag(args, "task");
    const mode = getAcsMode(args);
    printNextActions(await getNextActions({ rootDir: process.cwd(), role, taskId, mode }));
    return;
  }

  if (command === "index") {
    const result = await buildIndex(process.cwd());
    printResult(`Indexed ${result.artifactCount} artifacts and ${result.handoffCount} handoffs`, result);
    return;
  }

  if (command === "doctor") {
    const validation = await doctor(process.cwd());
    printValidation(validation);
    if (!validation.valid) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "install-skills") {
    const args = parseArgs(rest);
    const agent = getStringFlag(args, "agent");
    if (!agent) {
      console.error(`ERROR Missing required flag --agent. Expected one of: ${VALID_AGENTS.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    if (!VALID_AGENTS.includes(agent as AgentName)) {
      console.error(`ERROR Unknown agent "${agent}". Expected one of: ${VALID_AGENTS.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    const rootDir = String(args.positional[0] ?? args.flags["path"] ?? process.cwd());
    const result = await installSkills(rootDir, agent as AgentName);
    printResult(`Installed agent skills for ${agent}`, result);
    return;
  }

  if (command === "install-agent-config") {
    const args = parseArgs(rest);
    const rootDir = String(args.positional[0] ?? args.flags["path"] ?? process.cwd());
    console.log("Note: install-agent-config is deprecated. Use: acs install-skills --agent <cursor|claude|codex|all>");
    const result = await installSkills(rootDir, "all");
    printResult("Installed agent configuration", result);
    return;
  }

  if (command === "site") {
    await handleSite(rest);
    return;
  }

  throw new Error(`Unknown command "${command}". Run "acs --help" for usage.`);
}

async function runInitWizard(): Promise<void> {
  // Step 1 — store mode
  const mode = await select<StoreMode>({
    message: "How should the context store be hosted?",
    choices: [
      { value: "in-repo",    name: "in-repo    — .acs/ lives inside this project (default)" },
      { value: "local",      name: "local      — stored in your user data dir, nothing committed" },
      { value: "dedicated",  name: "dedicated  — a separate repo shared across multiple projects" },
    ],
    default: "in-repo",
  });

  // Step 2 — path (dedicated only)
  const wizardCwd = process.cwd();
  let rootDir = wizardCwd;
  if (mode === "dedicated") {
    rootDir = await input({
      message: "Path to the dedicated store repo:",
      default: wizardCwd,
      validate: (v) => v.trim().length > 0 || "Path cannot be empty",
    });
  }

  // Step 3 — agent skill targets (multi-select)
  type SkillAgent = Exclude<AgentName, "openclaw" | "all">;
  const agentChoices = await checkbox<SkillAgent>({
    message: "Install agent skill files? (space to toggle)",
    choices: [
      { value: "claude", name: `Claude Code  → ~/.claude/CLAUDE.md + ~/.claude/skills/` },
      { value: "cursor", name: `Cursor       → ~/.cursor/AGENTS.md + ~/.cursor/skills/` },
      { value: "codex",  name: `Codex        → ~/.codex/AGENTS.md  + ~/.codex/skills/` },
    ],
  });

  // Step 4 — confirm
  const agentSummary = agentChoices.length > 0 ? agentChoices.join(", ") : "none";
  const storePath = mode === "in-repo"
    ? path.join(rootDir, ".acs")
    : mode === "local"
      ? path.join(os.homedir(), "Library", "Application Support", "agent-context-store", "stores", "<slug>")
      : rootDir;

  console.log("");
  console.log(`  Mode:    ${mode}`);
  console.log(`  Store:   ${storePath}`);
  console.log(`  Skills:  ${agentSummary}`);
  console.log("");

  const proceed = await confirm({ message: "Proceed with initialization?", default: true });
  if (!proceed) {
    console.log("Aborted.");
    return;
  }

  // Execute init — for dedicated mode with a different store path, pass the
  // wizard's cwd so a .acs/config.yaml pointer is written in the project dir.
  const projectDir = (mode === "dedicated" && path.resolve(rootDir) !== path.resolve(wizardCwd)) ? wizardCwd : undefined;
  const result = await initContextStore({ rootDir, mode, projectDir });
  printResult(`Initialized context store (mode: ${mode})`, result);

  // Execute skill installs
  for (const agent of agentChoices) {
    const skillResult = await installSkills(rootDir, agent);
    if (skillResult.created.length > 0 || skillResult.updated.length > 0) {
      printResult(`Installed ${agent} skills`, skillResult);
    }
    for (const w of skillResult.warnings) {
      console.warn(`WARNING ${w}`);
    }
  }
}

async function installSkills(_rootDirInput: string, agent: AgentName): Promise<{ created: string[]; updated: string[]; warnings: string[] }> {
  const sourceRoot = findAgentConfigRoot();
  const result = { created: [] as string[], updated: [] as string[], warnings: [] as string[] };

  if (agent === "openclaw") {
    result.warnings.push("OpenClaw skill target is not available yet");
    return result;
  }

  const agents: Exclude<AgentName, "openclaw" | "all">[] = agent === "all"
    ? ["cursor", "claude", "codex"]
    : [agent as Exclude<AgentName, "openclaw" | "all">];

  if (agent === "all") {
    result.warnings.push("OpenClaw skill target is not available yet");
  }

  // Install dotdir config files (AGENTS.md / CLAUDE.md) into each agent's user dotdir
  for (const a of agents) {
    for (const file of agentDotdirFiles[a]) {
      const sourcePath = path.join(sourceRoot, file.source);
      const dotdirBase = path.join(os.homedir(), agentSkillDirName[a]);
      const targetPath = path.join(dotdirBase, file.target);
      const targetExists = existsSync(targetPath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      if (targetExists && file.mode === "append") {
        const content = (await readFile(sourcePath, "utf8")).trimEnd();
        await appendFile(targetPath, `\n\n${content}\n`, "utf8");
      } else {
        await copyFile(sourcePath, targetPath);
      }
      const displayPath = toPosix(path.relative(os.homedir(), targetPath));
      if (targetExists) {
        result.updated.push(displayPath);
      } else {
        result.created.push(displayPath);
      }
    }
  }

  // Install skill files into the user's global agent directory (~/.claude/, ~/.cursor/, ~/.codex/)
  const installedSkillTargets = new Set<string>();
  for (const a of agents) {
    for (const skill of ROLE_SKILLS) {
      const sourcePath = path.join(sourceRoot, "skills", skill, "SKILL.md");
      const targetPath = path.join(getUserSkillsDir(a), skill, "SKILL.md");
      if (installedSkillTargets.has(targetPath)) continue;
      installedSkillTargets.add(targetPath);
      const targetExists = existsSync(targetPath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
      const displayPath = toPosix(path.relative(os.homedir(), targetPath));
      if (targetExists) {
        result.updated.push(displayPath);
      } else {
        result.created.push(displayPath);
      }
    }
  }

  return result;
}

async function isRoleCommand(command: string): Promise<boolean> {
  const roles = await listRoles(process.cwd());
  return roles.some((role) => role.role === command) || ["developer", "reviewer"].includes(command);
}

async function handleRoleCommand(role: string, rest: string[]): Promise<void> {
  const [action, ...tail] = rest;
  if (action === "new") {
    await handleNewArtifact([...tail, "--role", role]);
    return;
  }
  if (action === "package") {
    await handlePackage([...tail, "--role", role]);
    return;
  }
  if (action === "next") {
    const args = parseArgs([...tail, "--role", role]);
    const taskId = requireFlag(args, "task");
    const mode = getAcsMode(args);
    printNextActions(await getNextActions({ rootDir: process.cwd(), role, taskId, mode }));
    return;
  }
  throw new Error(`Unknown role command "${role} ${action ?? ""}". Expected new, package, or next.`);
}

async function handleNewArtifact(rest: string[]): Promise<void> {
  const [type, ...tail] = rest;
  if (!type) {
    throw new Error("Missing artifact type. Example: acs new srs --task TASK-123");
  }
  const args = parseArgs(tail);
  const taskId = requireFlag(args, "task");
  const title = getStringFlag(args, "title");
  const role = getStringFlag(args, "role");
  const result = await createArtifact({
    rootDir: process.cwd(),
    type,
    taskId,
    title,
    role
  });
  printResult(`Created artifact ${result.artifactId}`, result);
}

async function handlePackage(rest: string[]): Promise<void> {
  const args = parseArgs(rest);
  const taskId = requireFlag(args, "task");
  const role = requireFlag(args, "role");
  const format = getStringFlag(args, "format") === "json" ? "json" : "markdown";
  const maxTokensRaw = getStringFlag(args, "max-tokens");
  let maxTokens: number | undefined;
  if (maxTokensRaw) {
    const parsedMaxTokens = Number.parseInt(maxTokensRaw, 10);
    if (!Number.isFinite(parsedMaxTokens) || parsedMaxTokens <= 0 || String(parsedMaxTokens) !== maxTokensRaw) {
      throw new Error("--max-tokens must be a positive integer");
    }
    maxTokens = parsedMaxTokens;
  }
  const result = await buildContextPackage({ rootDir: process.cwd(), taskId, role, format, maxTokens });
  printResult(`Built context package ${result.packagePath}`, result);
  if (result.warnings.length === 0) {
    const packagePath = path.resolve(process.cwd(), result.packagePath);
    if (existsSync(packagePath)) {
      const advisory = readPackageContextBudget(packagePath);
      if (advisory && advisory.risk !== "ok") {
        console.log(`warning context budget ${advisory.risk}: estimated ${advisory.estimated_tokens} / ${advisory.max_tokens} tokens`);
      }
    }
  }
}

function readPackageContextBudget(packagePath: string): { risk: string; estimated_tokens: number; max_tokens: number } | null {
  try {
    const content = readFileSync(packagePath, "utf8");
    if (packagePath.endsWith(".json")) {
      const parsed = JSON.parse(content) as { context_budget?: { risk?: unknown; estimated_tokens?: unknown; max_tokens?: unknown } };
      const budget = parsed.context_budget;
      if (typeof budget?.risk === "string" && typeof budget.estimated_tokens === "number" && typeof budget.max_tokens === "number") {
        return { risk: budget.risk, estimated_tokens: budget.estimated_tokens, max_tokens: budget.max_tokens };
      }
    }
    const risk = content.match(/- risk: ([^\n]+)/)?.[1]?.trim();
    const estimated = Number.parseInt(content.match(/- estimated_tokens: ([0-9]+)/)?.[1] ?? "", 10);
    const max = Number.parseInt(content.match(/- max_tokens: ([0-9]+)/)?.[1] ?? "", 10);
    if (risk && Number.isFinite(estimated) && Number.isFinite(max)) {
      return { risk, estimated_tokens: estimated, max_tokens: max };
    }
  } catch {
    return null;
  }
  return null;
}

function findAgentConfigRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  let currentDir = path.dirname(currentFile);
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(currentDir, "agent-config");
    if (existsSync(path.join(candidate, "skills")) && existsSync(path.join(candidate, "AGENTS.md"))) {
      return candidate;
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error("Agent config templates not found. Ensure the package is correctly installed.");
}

async function handleHandoff(rest: string[]): Promise<void> {
  const [action, ...tail] = rest;
  if (action === "create") {
    const args = parseArgs(tail);
    const fromRole = requireFlag(args, "from");
    const toRole = requireFlag(args, "to");
    const taskId = requireFlag(args, "task");
    const mode = getAcsMode(args);
    const result = await createHandoff({ rootDir: process.cwd(), fromRole, toRole, taskId, mode });
    printResult(`Created handoff ${result.handoffId} (${fromRole}->${toRole}, mode=${mode})`, result);
    return;
  }

  if (action === "check") {
    const args = parseArgs(tail);
    const fromRole = getStringFlag(args, "from");
    const toRole = getStringFlag(args, "to");
    const taskId = getStringFlag(args, "task");
    const mode = getAcsMode(args);
    if (fromRole && toRole && taskId) {
      const validation = await checkHandoff({ rootDir: process.cwd(), fromRole, toRole, taskId, mode });
      printValidation(validation);
      if (!validation.valid) {
        process.exitCode = 1;
      }
      return;
    }
    const handoffRef = args.positional[0] ?? getStringFlag(args, "id");
    if (!handoffRef) {
      throw new Error("Missing handoff id/path or --from --to --task. Example: acs handoff check HOFF-DEMO-0001-BA-SA");
    }
    const validation = await checkHandoff(process.cwd(), String(handoffRef));
    printValidation(validation);
    if (!validation.valid) {
      process.exitCode = 1;
    }
    return;
  }

  if (action === "list") {
    const args = parseArgs(tail);
    const handoffs = await listHandoffs({
      rootDir: process.cwd(),
      taskId: getStringFlag(args, "task"),
      role: getStringFlag(args, "role")
    });
    for (const handoff of handoffs) {
      console.log(handoff);
    }
    return;
  }

  throw new Error('Unknown handoff action. Expected "create", "check", or "list".');
}

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const name = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[name] = true;
      continue;
    }

    flags[name] = next;
    index += 1;
  }

  return { positional, flags };
}

function requireFlag(args: ParsedArgs, name: string): string {
  const value = getStringFlag(args, name);
  if (!value) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

function getStringFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}

function printResult(title: string, result: { created: string[]; updated: string[]; warnings: string[] }): void {
  console.log(`OK ${title}`);
  for (const filePath of result.created) {
    console.log(`created ${filePath}`);
  }
  for (const filePath of result.updated) {
    console.log(`updated ${filePath}`);
  }
  for (const warning of result.warnings) {
    console.log(`warning ${warning}`);
  }
}

function printValidation(validation: { valid: boolean; errors: string[]; warnings: string[]; artifacts: unknown[]; handoffs: string[]; hints?: AcsHint[]; mode?: AcsMode }): void {
  console.log(validation.valid ? "OK validation passed" : "ERROR validation failed");
  console.log(`artifacts ${validation.artifacts.length}`);
  console.log(`handoffs ${validation.handoffs.length}`);

  for (const warning of validation.warnings) {
    console.log(`warning ${warning}`);
  }
  for (const error of validation.errors) {
    console.error(`error ${error}`);
  }
  printHints(validation.hints);
}

function printHints(hints?: AcsHint[]): void {
  if (!hints || hints.length === 0) return;
  console.log("");
  console.log("Hints (for AI agents):");
  for (const hint of hints) {
    console.log(`- [${hint.for}] ${hint.message}`);
  }
}

function printRoleExplanation(explanation: {
  role: string;
  displayName: string;
  canCreate: string[];
  canRead: string[];
  canUpdate: string[];
  handoffTargets: string[];
  packageInclude: string[];
  taskId?: string;
  requiredInputs?: string[];
  suggestedCommands: string[];
}): void {
  if (explanation.taskId) {
    console.log(`Task: ${explanation.taskId}`);
  }
  console.log(`Role: ${explanation.role}`);
  console.log(`Display: ${explanation.displayName}`);
  console.log("Can create:");
  for (const type of explanation.canCreate) {
    console.log(`- ${type}`);
  }
  console.log("Can read:");
  for (const type of explanation.canRead) {
    console.log(`- ${type}`);
  }
  if (explanation.requiredInputs && explanation.requiredInputs.length > 0) {
    console.log("Required input artifacts:");
    for (const type of explanation.requiredInputs) {
      console.log(`- ${type}`);
    }
  }
  console.log("Handoff targets:");
  for (const target of explanation.handoffTargets) {
    console.log(`- ${target}`);
  }
  console.log("Suggested commands:");
  for (const command of explanation.suggestedCommands) {
    console.log(`- ${command}`);
  }
}

function printNextActions(next: {
  role: string;
  taskId: string;
  currentStage?: string;
  requiredInputs: Array<{ type: string; found: boolean }>;
  suggestedOutputs: string[];
  suggestedCommands: string[];
  mode?: AcsMode;
  hints?: AcsHint[];
}): void {
  console.log(`Task: ${next.taskId}`);
  console.log(`Role: ${next.role}`);
  if (next.mode) {
    console.log(`Mode: ${next.mode}`);
  }
  if (next.currentStage) {
    console.log(`Current stage: ${next.currentStage}`);
  }
  if (next.requiredInputs.length > 0) {
    console.log("Required inputs:");
    for (const input of next.requiredInputs) {
      console.log(`- ${input.type}: ${input.found ? "found" : "missing"}`);
    }
  }
  console.log("Suggested outputs:");
  for (const output of next.suggestedOutputs) {
    console.log(`- ${output}`);
  }
  console.log("Suggested commands:");
  for (const command of next.suggestedCommands) {
    console.log(`- ${command}`);
  }
  printHints(next.hints);
}

function printHelp(): void {
  console.log(`Agent Context Store Toolkit

Usage:
  acs --version
  acs init [path] [--mode <in-repo|local|dedicated>]
  acs link <existing_store_path> [--path <project_path>] [--force]
  acs status
  acs install-skills --agent <cursor|claude|codex|openclaw|all> [--path <path>]
  acs roles
  acs role explain <ROLE> [--task <TASK_ID>]
  acs new <ARTIFACT_TYPE> [--role <ROLE>] --task <TASK_ID> [--title <TITLE>]
  acs <ROLE> new <ARTIFACT_TYPE> --task <TASK_ID> [--title <TITLE>]
  acs next --role <ROLE> --task <TASK_ID> [--mode strict|relaxed]
  acs validate [--role <ROLE>] [--task <TASK_ID>] [--artifact <PATH>] [--mode strict|relaxed]
  acs handoff create --from <ROLE> --to <ROLE> --task <TASK_ID> [--mode strict|relaxed]
  acs handoff check <HANDOFF_ID_OR_PATH>
  acs handoff check --from <ROLE> --to <ROLE> --task <TASK_ID> [--mode strict|relaxed]
  acs handoff list [--task <TASK_ID>] [--role <ROLE>]
  acs package --task <TASK_ID> --role <ROLE> [--format markdown|json] [--max-tokens <N>]
  acs <ROLE> package --task <TASK_ID> [--format markdown|json] [--max-tokens <N>]
  acs log --task <TASK_ID> [--tail N] [--json]
  acs index
  acs doctor
  acs site build [--task <TASK_ID>]

Validation strictness (--mode):
  strict   (default) Upstream artifacts are required; missing inputs are errors.
  relaxed  Any role may be the entry point. Missing upstream artifacts become
           warnings + AI hints. Use 'acs handoff create --from system --to <ROLE>
           --task <TASK_ID> --mode relaxed' to record a synthetic entry handoff.

Modes (--mode):
  in-repo     Store context in .acs/ inside this project (default)
  local       Store context in OS user-data dir, no repo changes
  dedicated   This directory IS the context store root

Examples:
  acs init                                       # in-repo: creates .acs/ in current dir
  acs init --mode in-repo                        # same as above
  acs init --mode local                          # local: store in user data dir
  acs init --mode dedicated /path/to/store-repo  # dedicated store repo
  acs link /path/to/existing-store               # attach current project to an existing store
  acs link /path/to/existing-store --path D:\\my-repo
  acs status
  acs install-skills --agent cursor
  acs install-skills --agent claude
  acs install-skills --agent all --path D:\\my-repo
  acs new srs --task DEMO-0001 --title "Login with OTP"
  acs ba new srs --task DEMO-0001
  acs role explain dev --task DEMO-0001
  acs next --role sa --task DEMO-0001
  acs handoff create --from ba --to sa --task DEMO-0001
  acs package --task DEMO-0001 --role sa
  acs site build                              # generate static site under .acs/site/
  acs site build --task DEMO-0001            # site focused on a single task
`);
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

// ─── site build ──────────────────────────────────────────────────────────────

async function handleSite(rest: string[]): Promise<void> {
  const [action, ...tail] = rest;
  if (action !== "build") {
    throw new Error(`Unknown site action "${action ?? ""}". Expected "build". Usage: acs site build [--task <TASK_ID>]`);
  }
  const args = parseArgs(tail);
  const taskFilter = getStringFlag(args, "task");
  const model = await buildSiteModel(process.cwd(), taskFilter);
  if (taskFilter && model.tasks.length === 0) {
    console.log(`notice no artifacts found for task "${taskFilter}" — site will be empty`);
  }
  const { storeDir } = model.store;
  const siteDir = path.join(storeDir, "site");

  await mkdir(path.join(siteDir, "assets"), { recursive: true });
  await mkdir(path.join(siteDir, "data"), { recursive: true });

  // Write model.json
  const modelJsonPath = path.join(siteDir, "data", "model.json");
  await writeFileUtf8(modelJsonPath, JSON.stringify(model, null, 2));

  // Write site.css
  const cssPath = path.join(siteDir, "assets", "site.css");
  await writeFileUtf8(cssPath, buildSiteCss());

  // Write site.js
  const jsPath = path.join(siteDir, "assets", "site.js");
  await writeFileUtf8(jsPath, buildSiteJs());

  // Write index.html
  const htmlPath = path.join(siteDir, "index.html");
  await writeFileUtf8(htmlPath, buildSiteHtml());

  console.log(`OK site build complete`);
  console.log(`created ${toPosix(htmlPath)}`);
  console.log(`created ${toPosix(path.join(siteDir, "data", "model.json"))}`);
  console.log(`created ${toPosix(cssPath)}`);
  console.log(`created ${toPosix(jsPath)}`);
}

async function writeFileUtf8(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, "utf8");
}

function buildSiteHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ACS Dashboard</title>
  <link rel="stylesheet" href="assets/site.css" />
</head>
<body>
  <nav id="nav">
    <a href="#" data-view="dashboard">Dashboard</a>
    <a href="#" data-view="kanban">Kanban</a>
    <a href="#" data-view="artifacts">Artifacts</a>
    <a href="#" data-view="handoffs">Handoffs</a>
    <a href="#" data-view="validation">Validation</a>
  </nav>
  <main id="main"></main>
  <script src="assets/site.js"></script>
</body>
</html>
`;
}

function buildSiteCss(): string {
  return [
    "/* ACS Static Site — zero-dependency styles */",
    "*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }",
    "body { font-family: system-ui, sans-serif; background: #f8f9fa; color: #212529; line-height: 1.5; }",
    "nav { background: #343a40; padding: 0.75rem 1.5rem; display: flex; gap: 1.5rem; }",
    "nav a { color: #adb5bd; text-decoration: none; font-size: 0.9rem; }",
    "nav a:hover, nav a.active { color: #fff; }",
    "#main { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }",
    "h1 { font-size: 1.5rem; margin-bottom: 1rem; }",
    "h2 { font-size: 1.2rem; margin: 1rem 0 0.5rem; }",
    "h3 { font-size: 1rem; margin: 0.75rem 0 0.25rem; }",
    ".cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }",
    ".card { background: #fff; border-radius: 6px; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); }",
    ".card .value { font-size: 2rem; font-weight: bold; }",
    ".card .label { font-size: 0.8rem; color: #6c757d; }",
    ".kanban { display: flex; gap: 1rem; overflow-x: auto; padding-bottom: 1rem; }",
    ".kanban-col { background: #e9ecef; border-radius: 6px; min-width: 160px; padding: 0.75rem; }",
    ".kanban-col h3 { font-size: 0.85rem; color: #495057; margin-bottom: 0.5rem; }",
    ".kanban-card { background: #fff; border-radius: 4px; padding: 0.5rem 0.75rem; margin-bottom: 0.5rem; font-size: 0.85rem; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,.08); }",
    ".kanban-card:hover { background: #f0f4ff; }",
    "table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); }",
    "th, td { padding: 0.6rem 0.9rem; text-align: left; border-bottom: 1px solid #dee2e6; font-size: 0.88rem; }",
    "th { background: #f1f3f5; font-weight: 600; }",
    "tr:last-child td { border-bottom: none; }",
    ".badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 3px; font-size: 0.75rem; font-weight: 600; }",
    ".badge-ok { background: #d1e7dd; color: #0f5132; }",
    ".badge-warn { background: #fff3cd; color: #664d03; }",
    ".badge-error { background: #f8d7da; color: #842029; }",
    ".badge-blocked { background: #f8d7da; color: #842029; }",
    ".badge-done { background: #d1e7dd; color: #0f5132; }",
    ".error-list { list-style: none; }",
    ".error-list li { padding: 0.3rem 0; border-bottom: 1px solid #dee2e6; font-size: 0.85rem; }",
    ".error-list li::before { content: '\\2716  '; color: #dc3545; }",
    ".warn-list li::before { content: '\\26A0  '; color: #ffc107; }",
    "pre { background: #f1f3f5; padding: 0.75rem; border-radius: 4px; overflow-x: auto; font-size: 0.82rem; }",
    "code { background: #f1f3f5; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.88em; }",
    ""
  ].join("\n");
}

function buildSiteJs(): string {
  // Use string concatenation for the JS code to avoid backtick template literal conflicts.
  // The JS regex patterns for fenced code blocks use triple-backtick which cannot be
  // embedded in a TypeScript template literal.
  const tripleBacktick = String.fromCharCode(96, 96, 96);
  const singleBacktick = String.fromCharCode(96);
  const lines: string[] = [
    "/* ACS Static Site — zero-dependency JavaScript */",
    "(function() {",
    "  'use strict';",
    "  var model = null;",
    "  var currentView = 'dashboard';",
    "  function escHtml(str) {",
    "    return String(str)",
    "      .replace(/&/g, '&amp;')",
    "      .replace(/</g, '&lt;')",
    "      .replace(/>/g, '&gt;')",
    "      .replace(/\"/g, '&quot;')",
    "      .replace(/'/g, '&#39;');",
    "  }",
    "  function renderMarkdown(src) {",
    "    var lines = String(src).split(/\\r?\\n/);",
    "    var out = [];",
    "    var inCode = false;",
    "    var codeLang = '';",
    "    var codeLines = [];",
    "    var inUl = false;",
    "    var inOl = false;",
    "    function flushUl() { if (inUl) { out.push('</ul>'); inUl = false; } }",
    "    function flushOl() { if (inOl) { out.push('</ol>'); inOl = false; } }",
    "    function flushList() { flushUl(); flushOl(); }",
    "    var FENCE = " + JSON.stringify(tripleBacktick) + ";",
    "    for (var i = 0; i < lines.length; i++) {",
    "      var line = lines[i];",
    "      if (!inCode && line.slice(0,3) === FENCE) {",
    "        flushList(); inCode = true; codeLang = escHtml(line.slice(3).trim()); codeLines = []; continue;",
    "      }",
    "      if (inCode) {",
    "        if (line.slice(0,3) === FENCE) {",
    "          out.push('<pre><code' + (codeLang ? ' class=\"lang-' + codeLang + '\"' : '') + '>' + codeLines.map(function(l){ return escHtml(l); }).join('\\n') + '</code></pre>');",
    "          inCode = false; codeLines = []; codeLang = '';",
    "        } else { codeLines.push(line); }",
    "        continue;",
    "      }",
    "      var hMatch = line.match(/^(#{1,6})\\s+(.*)/);",
    "      if (hMatch) { flushList(); var level = hMatch[1].length; out.push('<h' + level + '>' + escHtml(hMatch[2]) + '</h' + level + '>'); continue; }",
    "      if (/^[-*]\\s/.test(line)) { flushOl(); if (!inUl) { out.push('<ul>'); inUl = true; } out.push('<li>' + renderInline(line.slice(2)) + '</li>'); continue; }",
    "      var olMatch = line.match(/^\\d+\\.\\s+(.*)/);",
    "      if (olMatch) { flushUl(); if (!inOl) { out.push('<ol>'); inOl = true; } out.push('<li>' + renderInline(olMatch[1]) + '</li>'); continue; }",
    "      if (line.trim() === '') { flushList(); continue; }",
    "      flushList(); out.push('<p>' + renderInline(line) + '</p>');",
    "    }",
    "    flushList();",
    "    return out.join('\\n');",
    "  }",
    "  function renderInline(text) {",
    "    var BT = " + JSON.stringify(singleBacktick) + ";",
    "    var re1 = new RegExp(BT + '([^' + BT + ']+)' + BT, 'g');",
    "    // escHtml is applied to the whole text first; label/href are already HTML-escaped.",
    "    return escHtml(text)",
    "      .replace(re1, '<code>$1</code>')",
    "      .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, function(_, label, href) {",
    "        var scheme = href.split(':')[0].toLowerCase();",
    "        var isSafe = href.charAt(0) === '#' || href.charAt(0) === '/' || href.charAt(0) === '.' ||",
    "          scheme === 'https' || scheme === 'http' || scheme === 'mailto';",
    "        // Unsafe scheme: degrade to plain label text (already HTML-escaped)",
    "        if (!isSafe) { return label; }",
    "        var safeHref = href.replace(/[^a-zA-Z0-9_.\\-/:?&#=@%+]/g, '');",
    "        // label is already HTML-escaped from the initial escHtml call",
    "        return '<a href=\"' + safeHref + '\">' + label + '</a>';",
    "      });",
    "  }",
    "  function badge(text, cls) { return '<span class=\"badge badge-' + escHtml(cls) + '\">' + escHtml(text) + '</span>'; }",
    "  function renderDashboard() {",
    "    var v = model.validation;",
    "    var validBadge = v.valid ? badge('valid', 'ok') : badge('invalid', 'error');",
    "    return '<h1>ACS Dashboard</h1>' +",
    "      '<div class=\"cards\">' +",
    "      '<div class=\"card\"><div class=\"value\">' + escHtml(String(model.tasks.length)) + '</div><div class=\"label\">Tasks</div></div>' +",
    "      '<div class=\"card\"><div class=\"value\">' + escHtml(String(model.artifacts.length)) + '</div><div class=\"label\">Artifacts</div></div>' +",
    "      '<div class=\"card\"><div class=\"value\">' + escHtml(String(model.handoffs.length)) + '</div><div class=\"label\">Handoffs</div></div>' +",
    "      '<div class=\"card\"><div class=\"value\">' + validBadge + '</div><div class=\"label\">Validation</div></div>' +",
    "      '</div>' +",
    "      '<p><strong>Store:</strong> ' + escHtml(model.store.storeDir) + '</p>' +",
    "      '<p><strong>Mode:</strong> ' + escHtml(model.store.mode) + '</p>' +",
    "      '<p><strong>Generated:</strong> ' + escHtml(model.generatedAt) + '</p>';",
    "  }",
    "  var kanbanOrder = ['Entry', 'BA', 'SA', 'DEV', 'QA', 'Review', 'Blocked', 'Done'];",
    "  function renderKanban() {",
    "    var cols = {};",
    "    kanbanOrder.forEach(function(s) { cols[s] = []; });",
    "    model.tasks.forEach(function(t) { var s = t.kanbanState || 'Entry'; if (!cols[s]) cols[s] = []; cols[s].push(t); });",
    "    var html = '<h1>Kanban Board</h1><div class=\"kanban\">';",
    "    kanbanOrder.forEach(function(state) {",
    "      html += '<div class=\"kanban-col\"><h3>' + escHtml(state) + ' (' + cols[state].length + ')</h3>';",
    "      cols[state].forEach(function(t) {",
    "        html += '<div class=\"kanban-card\" onclick=\"showTaskDetail(' + escHtml(JSON.stringify(t.taskId)) + ')\">' + escHtml(t.taskId) + '<br><small>' + escHtml(String(t.artifactCount)) + ' artifacts</small></div>';",
    "      });",
    "      html += '</div>';",
    "    });",
    "    html += '</div>'; return html;",
    "  }",
    "  function renderArtifacts() {",
    "    var html = '<h1>Artifacts</h1><table><thead><tr><th>ID</th><th>Type</th><th>Task</th><th>Status</th><th>Approval</th></tr></thead><tbody>';",
    "    model.artifacts.forEach(function(a) { html += '<tr><td>' + escHtml(a.id) + '</td><td>' + escHtml(a.type) + '</td><td>' + escHtml(a.taskId) + '</td><td>' + escHtml(a.status) + '</td><td>' + escHtml(a.approvalStatus) + '</td></tr>'; });",
    "    html += '</tbody></table>'; return html;",
    "  }",
    "  function renderHandoffs() {",
    "    var html = '<h1>Handoffs</h1><table><thead><tr><th>ID</th><th>Task</th><th>From</th><th>To</th><th>Status</th><th>Approval</th></tr></thead><tbody>';",
    "    model.handoffs.forEach(function(h) { html += '<tr><td>' + escHtml(h.id) + '</td><td>' + escHtml(h.taskId) + '</td><td>' + escHtml(h.fromRole) + '</td><td>' + escHtml(h.toRole) + '</td><td>' + escHtml(h.status) + '</td><td>' + escHtml(h.approvalStatus) + '</td></tr>'; });",
    "    html += '</tbody></table>'; return html;",
    "  }",
    "  function renderValidation() {",
    "    var v = model.validation;",
    "    var html = '<h1>Validation</h1>';",
    "    html += '<p>' + (v.valid ? badge('PASSED', 'ok') : badge('FAILED', 'error')) + '</p>';",
    "    if (v.errors.length > 0) { html += '<h2>Errors (' + v.errors.length + ')</h2><ul class=\"error-list\">'; v.errors.forEach(function(e) { html += '<li>' + escHtml(e) + '</li>'; }); html += '</ul>'; }",
    "    if (v.warnings.length > 0) { html += '<h2>Warnings (' + v.warnings.length + ')</h2><ul class=\"error-list warn-list\">'; v.warnings.forEach(function(w) { html += '<li>' + escHtml(w) + '</li>'; }); html += '</ul>'; }",
    "    if (v.errors.length === 0 && v.warnings.length === 0) { html += '<p>No issues found.</p>'; }",
    "    return html;",
    "  }",
    "  function showTaskDetail(taskId) {",
    "    var t = model.tasks.find(function(x) { return x.taskId === taskId; });",
    "    if (!t) return;",
    "    var html = '<h1>Task: ' + escHtml(t.taskId) + '</h1>';",
    "    html += '<p><strong>Kanban:</strong> ' + escHtml(t.kanbanState) + ' &nbsp; <strong>Next role:</strong> ' + escHtml(t.suggestedNextRole) + '</p>';",
    "    html += '<h2>Artifacts (' + t.artifactCount + ')</h2>';",
    "    if (t.artifacts.length > 0) { html += '<table><thead><tr><th>ID</th><th>Type</th><th>Status</th></tr></thead><tbody>'; t.artifacts.forEach(function(a) { html += '<tr><td>' + escHtml(a.id) + '</td><td>' + escHtml(a.type) + '</td><td>' + escHtml(a.status) + '</td></tr>'; }); html += '</tbody></table>'; }",
    "    html += '<h2>Timeline (' + t.timeline.length + ' events)</h2>';",
    "    if (t.timeline.length > 0) { html += '<ul>'; t.timeline.forEach(function(ev) { html += '<li>' + escHtml(ev.ts || '') + ' &mdash; ' + escHtml(ev.action) + '</li>'; }); html += '</ul>'; }",
    "    html += '<p><a href=\"#\" onclick=\"navigate(\\'kanban\\'); return false;\">&larr; Back to Kanban</a></p>';",
    "    document.getElementById('main').innerHTML = html;",
    "  }",
    "  window.showTaskDetail = showTaskDetail;",
    "  function navigate(view) {",
    "    currentView = view;",
    "    document.querySelectorAll('nav a').forEach(function(a) { a.classList.toggle('active', a.dataset.view === view); });",
    "    var main = document.getElementById('main');",
    "    switch (view) {",
    "      case 'dashboard': main.innerHTML = renderDashboard(); break;",
    "      case 'kanban': main.innerHTML = renderKanban(); break;",
    "      case 'artifacts': main.innerHTML = renderArtifacts(); break;",
    "      case 'handoffs': main.innerHTML = renderHandoffs(); break;",
    "      case 'validation': main.innerHTML = renderValidation(); break;",
    "      default: main.innerHTML = '<p>Unknown view.</p>';",
    "    }",
    "  }",
    "  window.navigate = navigate;",
    "  document.querySelectorAll('nav a').forEach(function(a) { a.addEventListener('click', function(e) { e.preventDefault(); navigate(a.dataset.view); }); });",
    "  fetch('data/model.json')",
    "    .then(function(r) { return r.json(); })",
    "    .then(function(data) { model = data; navigate('dashboard'); })",
    "    .catch(function(err) { document.getElementById('main').innerHTML = '<p style=\"color:red\">Failed to load model.json: ' + escHtml(String(err)) + '</p>'; });",
    "})();"
  ];
  return lines.join("\n") + "\n";
}

/**
 * Returns a JavaScript source string that, when evaluated with `new Function`,
 * returns an object `{ renderMarkdown, renderInline }`.
 * Intended for unit-testing the Markdown renderer without a browser.
 *
 * @example
 *   const src = buildRendererJs();
 *   const { renderMarkdown, renderInline } = new Function(src)();
 */
export function buildRendererJs(): string {
  const tripleBacktick = String.fromCharCode(96, 96, 96);
  const singleBacktick = String.fromCharCode(96);
  const lines: string[] = [
    "function escHtml(str) {",
    "  return String(str)",
    "    .replace(/&/g, '&amp;')",
    "    .replace(/</g, '&lt;')",
    "    .replace(/>/g, '&gt;')",
    "    .replace(/\"/g, '&quot;')",
    "    .replace(/'/g, '&#39;');",
    "}",
    "function renderMarkdown(src) {",
    "  var lines = String(src).split(/\\r?\\n/);",
    "  var out = [];",
    "  var inCode = false;",
    "  var codeLang = '';",
    "  var codeLines = [];",
    "  var inUl = false;",
    "  var inOl = false;",
    "  function flushUl() { if (inUl) { out.push('</ul>'); inUl = false; } }",
    "  function flushOl() { if (inOl) { out.push('</ol>'); inOl = false; } }",
    "  function flushList() { flushUl(); flushOl(); }",
    "  var FENCE = " + JSON.stringify(tripleBacktick) + ";",
    "  for (var i = 0; i < lines.length; i++) {",
    "    var line = lines[i];",
    "    if (!inCode && line.slice(0,3) === FENCE) {",
    "      flushList(); inCode = true; codeLang = escHtml(line.slice(3).trim()); codeLines = []; continue;",
    "    }",
    "    if (inCode) {",
    "      if (line.slice(0,3) === FENCE) {",
    "        out.push('<pre><code' + (codeLang ? ' class=\"lang-' + codeLang + '\"' : '') + '>' + codeLines.map(function(l){ return escHtml(l); }).join('\\n') + '</code></pre>');",
    "        inCode = false; codeLines = []; codeLang = '';",
    "      } else { codeLines.push(line); }",
    "      continue;",
    "    }",
    "    var hMatch = line.match(/^(#{1,6})\\s+(.*)/);",
    "    if (hMatch) { flushList(); var level = hMatch[1].length; out.push('<h' + level + '>' + escHtml(hMatch[2]) + '</h' + level + '>'); continue; }",
    "    if (/^[-*]\\s/.test(line)) { flushOl(); if (!inUl) { out.push('<ul>'); inUl = true; } out.push('<li>' + renderInline(line.slice(2)) + '</li>'); continue; }",
    "    var olMatch = line.match(/^\\d+\\.\\s+(.*)/);",
    "    if (olMatch) { flushUl(); if (!inOl) { out.push('<ol>'); inOl = true; } out.push('<li>' + renderInline(olMatch[1]) + '</li>'); continue; }",
    "    if (line.trim() === '') { flushList(); continue; }",
    "    flushList(); out.push('<p>' + renderInline(line) + '</p>');",
    "  }",
    "  flushList();",
    "  return out.join('\\n');",
    "}",
    "function renderInline(text) {",
    "  var BT = " + JSON.stringify(singleBacktick) + ";",
    "  var re1 = new RegExp(BT + '([^' + BT + ']+)' + BT, 'g');",
    "  // escHtml is applied to the whole text first; label/href are already HTML-escaped.",
    "  return escHtml(text)",
    "    .replace(re1, '<code>$1</code>')",
    "    .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, function(_, label, href) {",
    "      var scheme = href.split(':')[0].toLowerCase();",
    "      var isSafe = href.charAt(0) === '#' || href.charAt(0) === '/' || href.charAt(0) === '.' ||",
    "        scheme === 'https' || scheme === 'http' || scheme === 'mailto';",
    "      // Unsafe scheme: degrade to plain label text (already HTML-escaped)",
    "      if (!isSafe) { return label; }",
    "      var safeHref = href.replace(/[^a-zA-Z0-9_.\\-/:?&#=@%+]/g, '');",
    "      // label is already HTML-escaped from the initial escHtml call",
    "      return '<a href=\"' + safeHref + '\">' + label + '</a>';",
    "    });",
    "}",
    "return { renderMarkdown: renderMarkdown, renderInline: renderInline };"
  ];
  return lines.join("\n");
}

// Only run the CLI when this module is the entry point, not when imported
// (e.g. tests importing buildRendererJs must not trigger main()).
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath && (invokedPath === modulePath || invokedPath === modulePath.replace(/\.js$/, ""))) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
