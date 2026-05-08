#!/usr/bin/env node
import { appendFile, copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { select, checkbox, input, confirm } from "@inquirer/prompts";
import {
  buildContextPackage,
  buildIndex,
  checkHandoff,
  createArtifact,
  createHandoff,
  doctor,
  explainRole,
  getNextActions,
  getStoreInfo,
  initContextStore,
  listHandoffs,
  listRoles,
  validatePolicyScope,
  type StoreMode
} from "agent-context-store-core";

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

const validModes: StoreMode[] = ["in-repo", "local", "dedicated"];

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
  cursor: [{ source: "AGENTS.md", target: "AGENTS.md", mode: "append" }],
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
      const result = await initContextStore({ rootDir, mode });
      const label = modeArg ? `Initialized context store (mode: ${mode})` : "Initialized context store";
      printResult(label, result);
      return;
    }

    // Interactive wizard
    await runInitWizard();
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
    const validation = role || taskId || artifact
      ? await validatePolicyScope({ rootDir: process.cwd(), role, taskId, artifactPath: artifact })
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
    printValidation(validation);
    if (!validation.valid) {
      process.exitCode = 1;
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
    printNextActions(await getNextActions({ rootDir: process.cwd(), role, taskId }));
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
  let rootDir = process.cwd();
  if (mode === "dedicated") {
    rootDir = await input({
      message: "Path to the dedicated store repo:",
      default: process.cwd(),
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

  // Execute init
  const result = await initContextStore({ rootDir, mode });
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
    printNextActions(await getNextActions({ rootDir: process.cwd(), role, taskId }));
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
  const result = await buildContextPackage({ rootDir: process.cwd(), taskId, role, format });
  printResult(`Built context package ${result.packagePath}`, result);
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
    const result = await createHandoff({ rootDir: process.cwd(), fromRole, toRole, taskId });
    printResult(`Created handoff ${result.handoffId}`, result);
    return;
  }

  if (action === "check") {
    const args = parseArgs(tail);
    const fromRole = getStringFlag(args, "from");
    const toRole = getStringFlag(args, "to");
    const taskId = getStringFlag(args, "task");
    if (fromRole && toRole && taskId) {
      const validation = await checkHandoff({ rootDir: process.cwd(), fromRole, toRole, taskId });
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

function printValidation(validation: { valid: boolean; errors: string[]; warnings: string[]; artifacts: unknown[]; handoffs: string[] }): void {
  console.log(validation.valid ? "OK validation passed" : "ERROR validation failed");
  console.log(`artifacts ${validation.artifacts.length}`);
  console.log(`handoffs ${validation.handoffs.length}`);

  for (const warning of validation.warnings) {
    console.log(`warning ${warning}`);
  }
  for (const error of validation.errors) {
    console.error(`error ${error}`);
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
}): void {
  console.log(`Task: ${next.taskId}`);
  console.log(`Role: ${next.role}`);
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
}

function printHelp(): void {
  console.log(`Agent Context Store Toolkit

Usage:
  acs --version
  acs init [path] [--mode <in-repo|local|dedicated>]
  acs status
  acs install-skills --agent <cursor|claude|codex|openclaw|all> [--path <path>]
  acs roles
  acs role explain <ROLE> [--task <TASK_ID>]
  acs new <ARTIFACT_TYPE> [--role <ROLE>] --task <TASK_ID> [--title <TITLE>]
  acs <ROLE> new <ARTIFACT_TYPE> --task <TASK_ID> [--title <TITLE>]
  acs next --role <ROLE> --task <TASK_ID>
  acs validate [--role <ROLE>] [--task <TASK_ID>] [--artifact <PATH>]
  acs handoff create --from <ROLE> --to <ROLE> --task <TASK_ID>
  acs handoff check <HANDOFF_ID_OR_PATH>
  acs handoff check --from <ROLE> --to <ROLE> --task <TASK_ID>
  acs handoff list [--task <TASK_ID>] [--role <ROLE>]
  acs package --task <TASK_ID> --role <ROLE> [--format markdown|json]
  acs <ROLE> package --task <TASK_ID> [--format markdown|json]
  acs index
  acs doctor

Modes (--mode):
  in-repo     Store context in .acs/ inside this project (default)
  local       Store context in OS user-data dir, no repo changes
  dedicated   This directory IS the context store root

Examples:
  acs init                                       # in-repo: creates .acs/ in current dir
  acs init --mode in-repo                        # same as above
  acs init --mode local                          # local: store in user data dir
  acs init --mode dedicated /path/to/store-repo  # dedicated store repo
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
`);
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
