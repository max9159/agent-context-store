#!/usr/bin/env node
import {
  buildContextPackage,
  buildIndex,
  checkHandoff,
  createArtifact,
  createHandoff,
  doctor,
  initContextStore,
  type ArtifactType
} from "@agent-context-store/core";

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

const artifactTypes = new Set(["srs", "sdd", "adr", "api", "test"]);

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log("acs 0.1.0");
    return;
  }

  if (command === "init") {
    const args = parseArgs(rest);
    const rootDir = String(args.positional[0] ?? args.flags["path"] ?? process.cwd());
    const result = await initContextStore({ rootDir });
    printResult("Initialized context store", result);
    return;
  }

  if (command === "new") {
    const [type, ...tail] = rest;
    if (!artifactTypes.has(type)) {
      throw new Error(`Unknown artifact type "${type}". Expected one of: ${[...artifactTypes].join(", ")}`);
    }
    const args = parseArgs(tail);
    const taskId = requireFlag(args, "task");
    const title = getStringFlag(args, "title");
    const result = await createArtifact({
      rootDir: process.cwd(),
      type: type as ArtifactType,
      taskId,
      title
    });
    printResult(`Created artifact ${result.artifactId}`, result);
    return;
  }

  if (command === "validate") {
    const validation = await doctor(process.cwd());
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
    const args = parseArgs(rest);
    const taskId = requireFlag(args, "task");
    const role = requireFlag(args, "role");
    const format = getStringFlag(args, "format") === "json" ? "json" : "markdown";
    const result = await buildContextPackage({ rootDir: process.cwd(), taskId, role, format });
    printResult(`Built context package ${result.packagePath}`, result);
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

  throw new Error(`Unknown command "${command}". Run "acs --help" for usage.`);
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
    const handoffRef = args.positional[0] ?? getStringFlag(args, "id");
    if (!handoffRef) {
      throw new Error("Missing handoff id or path. Example: acs handoff check HOFF-DEMO-0001-BA-SA");
    }
    const validation = await checkHandoff(process.cwd(), String(handoffRef));
    printValidation(validation);
    if (!validation.valid) {
      process.exitCode = 1;
    }
    return;
  }

  throw new Error('Unknown handoff action. Expected "create" or "check".');
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

function printHelp(): void {
  console.log(`Agent Context Store Toolkit

Usage:
  acs init [path]
  acs new <srs|sdd|adr|api|test> --task <TASK_ID> [--title <TITLE>]
  acs validate
  acs handoff create --from <ROLE> --to <ROLE> --task <TASK_ID>
  acs handoff check <HANDOFF_ID_OR_PATH>
  acs package --task <TASK_ID> --role <ROLE> [--format markdown|json]
  acs index
  acs doctor

Examples:
  acs init
  acs new srs --task DEMO-0001 --title "Login with OTP"
  acs handoff create --from ba --to sa --task DEMO-0001
  acs package --task DEMO-0001 --role sa
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
