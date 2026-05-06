import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, type Dirent } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Ajv2020Module from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import { parse as parseYaml } from "yaml";

export type ArtifactType = "srs" | "sdd" | "adr" | "api" | "test";

export interface AcsResult {
  created: string[];
  updated: string[];
  warnings: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  artifacts: ArtifactRecord[];
  handoffs: string[];
}

export interface ArtifactRecord {
  id: string;
  type: string;
  title: string;
  version: string;
  approvalStatus: string;
  path: string;
}

export interface InitOptions {
  rootDir: string;
}

export interface CreateArtifactOptions {
  rootDir: string;
  type: ArtifactType;
  taskId: string;
  title?: string;
}

export interface CreateHandoffOptions {
  rootDir: string;
  fromRole: string;
  toRole: string;
  taskId: string;
}

export interface BuildContextPackageOptions {
  rootDir: string;
  taskId: string;
  role: string;
  format?: "markdown" | "json";
}

type AjvConstructor = new (options: { allErrors: boolean; strict: boolean; validateFormats: boolean }) => {
  compile(schema: unknown): ValidateFunction;
};

const artifactDefinitions: Record<ArtifactType, { dir: string; prefix: string; owner: string; template: string }> = {
  srs: { dir: "artifacts/requirements", prefix: "REQ", owner: "ba_agent", template: "srs" },
  sdd: { dir: "artifacts/design", prefix: "SDD", owner: "sa_agent", template: "sdd" },
  adr: { dir: "artifacts/adr", prefix: "ADR", owner: "sa_agent", template: "adr" },
  api: { dir: "artifacts/api", prefix: "API", owner: "sa_agent", template: "api-design" },
  test: { dir: "artifacts/test", prefix: "TC", owner: "qa_agent", template: "test-plan" }
};

const layoutDirectories = [
  ".context-store",
  ".context-store/audit",
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
];

const schemaFileNames = [
  "artifact.schema.json",
  "handoff.schema.json",
  "context-summary.schema.json",
  "context-package.schema.json",
  "approval.schema.json"
];

const templateFileNames = [
  "srs.md",
  "sdd.md",
  "adr.md",
  "api-design.md",
  "test-plan.md"
];

const validArtifactStatuses = new Set(["draft", "ready_for_review", "changes_requested", "approved", "deprecated", "superseded"]);
const validApprovalStatuses = new Set(["pending", "approved", "changes_requested", "deprecated", "superseded"]);

const roleArtifactTypes: Record<string, ArtifactType[]> = {
  ba: ["srs"],
  sa: ["srs", "sdd", "adr", "api"],
  dev: ["srs", "sdd", "adr", "api"],
  developer: ["srs", "sdd", "adr", "api"],
  qa: ["srs", "sdd", "adr", "api", "test"],
  reviewer: ["srs", "sdd", "adr", "api", "test"]
};

export async function initContextStore(options: InitOptions): Promise<AcsResult> {
  const rootDir = path.resolve(options.rootDir);
  const result = emptyResult();

  for (const dir of layoutDirectories) {
    const fullPath = path.join(rootDir, dir);
    if (!existsSync(fullPath)) {
      await mkdir(fullPath, { recursive: true });
      result.created.push(toPosix(dir));
    }
  }

  await writeIfMissing(rootDir, ".context-store/config.yaml", `version: 1
toolkit: agent-context-store
cli: acs
default_approval_status: pending
`);
  await writeIfMissing(rootDir, ".context-store/index.json", JSON.stringify({ generated_at: null, artifacts: [], handoffs: [] }, null, 2));

  for (const fileName of schemaFileNames) {
    await writeIfMissing(rootDir, `schemas/${fileName}`, await readAssetText("schemas", fileName));
  }

  for (const fileName of templateFileNames) {
    await writeIfMissing(rootDir, `templates/${fileName}`, await readAssetText("templates", fileName));
  }

  await writeIfMissing(rootDir, "docs/definition-of-ready.md", "# Definition of Ready\n\n- Required fields are present.\n- Artifact IDs are stable.\n- Source references are recorded.\n- Open questions are explicit.\n");
  await writeIfMissing(rootDir, "docs/definition-of-done.md", "# Definition of Done\n\n- Artifacts are validated.\n- Handoff packages are present.\n- Context package can be generated for the next role.\n");
  await writeIfMissing(rootDir, "docs/source-reference-rules.md", "# Source Reference Rules\n\nPrefer approved artifacts, issues, commits, PRs, and meeting notes over chat history.\n");
  await writeIfMissing(rootDir, "docs/approval-state-rules.md", "# Approval State Rules\n\nValid states: draft, ready_for_review, changes_requested, approved, deprecated, superseded.\n");

  return result;
}

export async function createArtifact(options: CreateArtifactOptions): Promise<AcsResult & { artifactPath: string; artifactId: string }> {
  const rootDir = path.resolve(options.rootDir);
  const definition = artifactDefinitions[options.type];
  const artifactId = `${definition.prefix}-${options.taskId}`;
  const title = options.title ?? `${artifactId} ${options.type.toUpperCase()}`;
  const relativePath = `${definition.dir}/${artifactId}.md`;
  const targetPath = path.join(rootDir, relativePath);

  if (existsSync(targetPath)) {
    throw new Error(`Artifact already exists: ${relativePath}`);
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  const template = await readContextTemplate(rootDir, definition.template);
  const content = renderTemplate(template, {
    ARTIFACT_ID: artifactId,
    TITLE: title,
    DATE: today()
  });
  await writeFile(targetPath, content, "utf8");
  await appendAudit(rootDir, `created artifact ${relativePath}`);

  return { ...emptyResult(), artifactPath: toPosix(relativePath), artifactId, created: [toPosix(relativePath)] };
}

export async function validateContextStore(rootDirInput: string): Promise<ValidationResult> {
  const rootDir = path.resolve(rootDirInput);
  const errors: string[] = [];
  const warnings: string[] = [];
  const artifactValidator = await loadSchemaValidator(rootDir, "artifact.schema.json");
  const handoffValidator = await loadSchemaValidator(rootDir, "handoff.schema.json");

  for (const dir of layoutDirectories) {
    if (!existsSync(path.join(rootDir, dir))) {
      errors.push(`Missing directory: ${dir}`);
    }
  }

  const artifactPaths = await listFiles(path.join(rootDir, "artifacts"), ".md");
  const artifacts: ArtifactRecord[] = [];
  for (const absolutePath of artifactPaths) {
    const relativePath = toPosix(path.relative(rootDir, absolutePath));
    const content = await readFile(absolutePath, "utf8");
    const metadata = parseFrontmatter(content);
    collectSchemaErrors(artifactValidator, metadata, relativePath, errors);
    if (metadata["approval_status"] === "approved" && metadata["status"] !== "approved") {
      warnings.push(`${relativePath}: approval_status is approved but status is ${String(metadata["status"] ?? "missing")}`);
    }
    artifacts.push({
      id: String(metadata["id"] ?? path.basename(absolutePath, ".md")),
      type: String(metadata["type"] ?? "unknown"),
      title: String(metadata["title"] ?? ""),
      version: String(metadata["version"] ?? ""),
      approvalStatus: String(metadata["approval_status"] ?? ""),
      path: relativePath
    });
  }

  const handoffPaths = await listFiles(path.join(rootDir, "handoffs"), ".yaml");
  for (const handoffPath of handoffPaths) {
    const relativePath = toPosix(path.relative(rootDir, handoffPath));
    const content = await readFile(handoffPath, "utf8");
    const handoff = parseYamlObject(content);
    collectSchemaErrors(handoffValidator, handoff, relativePath, errors);
    collectHandoffStructuralErrors(rootDir, relativePath, handoff, errors);
    for (const artifactRef of extractArtifactPaths(content)) {
      if (!existsSync(path.join(rootDir, artifactRef))) {
        errors.push(`${relativePath}: referenced artifact does not exist: ${artifactRef}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    artifacts,
    handoffs: handoffPaths.map((file) => toPosix(path.relative(rootDir, file)))
  };
}

export async function createHandoff(options: CreateHandoffOptions): Promise<AcsResult & { handoffPath: string; handoffId: string }> {
  const rootDir = path.resolve(options.rootDir);
  const fromRole = options.fromRole.toUpperCase();
  const toRole = options.toRole.toUpperCase();
  const handoffId = `HOFF-${options.taskId}-${fromRole}-${toRole}`;
  const relativePath = `handoffs/${handoffId}.yaml`;
  const targetPath = path.join(rootDir, relativePath);

  if (existsSync(targetPath)) {
    throw new Error(`Handoff already exists: ${relativePath}`);
  }

  const artifacts = (await findArtifactsForTask(rootDir, options.taskId)).map((artifact) => ({
    path: artifact.path,
    type: artifact.type,
    version: artifact.version || "v0.1",
    summary: `${artifact.id} (${artifact.title || artifact.type})`
  }));

  const yaml = stringifyHandoff({
    id: handoffId,
    taskId: options.taskId,
    fromRole,
    toRole,
    artifacts
  });
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, yaml, "utf8");
  await appendAudit(rootDir, `created handoff ${relativePath}`);

  return { ...emptyResult(), handoffPath: toPosix(relativePath), handoffId, created: [toPosix(relativePath)] };
}

export async function checkHandoff(rootDirInput: string, handoffRef: string): Promise<ValidationResult> {
  const rootDir = path.resolve(rootDirInput);
  const handoffPath = resolveHandoffPath(rootDir, handoffRef);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!handoffPath || !existsSync(handoffPath)) {
    errors.push(`Handoff not found: ${handoffRef}`);
    return { valid: false, errors, warnings, artifacts: [], handoffs: [] };
  }

  const content = await readFile(handoffPath, "utf8");
  const handoff = parseYamlObject(content);
  const handoffValidator = await loadSchemaValidator(rootDir, "handoff.schema.json");
  collectSchemaErrors(handoffValidator, handoff, toPosix(path.relative(rootDir, handoffPath)), errors);
  collectHandoffStructuralErrors(rootDir, toPosix(path.relative(rootDir, handoffPath)), handoff, errors);
  for (const artifactRef of extractArtifactPaths(content)) {
    if (!existsSync(path.join(rootDir, artifactRef))) {
      errors.push(`Referenced artifact does not exist: ${artifactRef}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    artifacts: [],
    handoffs: [toPosix(path.relative(rootDir, handoffPath))]
  };
}

export async function buildContextPackage(options: BuildContextPackageOptions): Promise<AcsResult & { packagePath: string }> {
  const rootDir = path.resolve(options.rootDir);
  const format = options.format ?? "markdown";
  const allArtifacts = await findArtifactsForTask(rootDir, options.taskId);
  const role = options.role.toLowerCase();
  const allowedTypes = roleArtifactTypes[role] ?? roleArtifactTypes["reviewer"];
  const artifacts = allArtifacts.filter((artifact) => {
    const typeAllowed = allowedTypes.includes(artifact.type as ArtifactType);
    const usableState = artifact.approvalStatus === "approved" || artifact.approvalStatus === "pending";
    return typeAllowed && usableState;
  });
  const excludedArtifacts = allArtifacts
    .filter((artifact) => !artifacts.includes(artifact))
    .map((artifact) => ({
      path: artifact.path,
      reason: !allowedTypes.includes(artifact.type as ArtifactType)
        ? `not required for ${options.role} role`
        : `approval_status ${artifact.approvalStatus || "missing"} is not usable`
    }));
  const handoffs = (await listFiles(path.join(rootDir, "handoffs"), ".yaml"))
    .filter((file) => path.basename(file).includes(options.taskId))
    .filter((file) => handoffMatchesRole(file, role))
    .map((file) => toPosix(path.relative(rootDir, file)));

  const packageBase = `packages/${options.taskId}.${options.role}.context`;
  const relativePath = format === "json" ? `${packageBase}.json` : `${packageBase}.md`;
  const targetPath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });

  const manifest = {
    task_id: options.taskId,
    role: options.role,
    generated_at: new Date().toISOString(),
    included_artifacts: artifacts.map((artifact) => ({ path: artifact.path, type: artifact.type, version: artifact.version })),
    included_handoffs: handoffs,
    excluded_artifacts: excludedArtifacts
  };

  if (format === "json") {
    await writeFile(targetPath, JSON.stringify(manifest, null, 2), "utf8");
  } else {
    const body = [
      `# Context Package: ${options.taskId} / ${options.role}`,
      "",
      "## Manifest",
      "",
      "```json",
      JSON.stringify(manifest, null, 2),
      "```",
      "",
      "## Included Artifacts",
      "",
      ...artifacts.map((artifact) => `- ${artifact.path} (${artifact.type}, ${artifact.version || "unknown version"})`),
      "",
      "## Excluded Artifacts",
      "",
      ...excludedArtifacts.map((artifact) => `- ${artifact.path}: ${artifact.reason}`),
      "",
      "## Included Handoffs",
      "",
      ...handoffs.map((handoff) => `- ${handoff}`),
      ""
    ].join("\n");
    await writeFile(targetPath, body, "utf8");
  }

  await appendAudit(rootDir, `built context package ${relativePath}`);
  return { ...emptyResult(), packagePath: toPosix(relativePath), created: [toPosix(relativePath)] };
}

export async function buildIndex(rootDirInput: string): Promise<AcsResult & { artifactCount: number; handoffCount: number }> {
  const rootDir = path.resolve(rootDirInput);
  const validation = await validateContextStore(rootDir);
  const index = {
    generated_at: new Date().toISOString(),
    artifacts: validation.artifacts,
    handoffs: validation.handoffs
  };
  await mkdir(path.join(rootDir, ".context-store"), { recursive: true });
  await writeFile(path.join(rootDir, ".context-store/index.json"), JSON.stringify(index, null, 2), "utf8");
  await appendAudit(rootDir, "rebuilt index");
  return { ...emptyResult(), updated: [".context-store/index.json"], artifactCount: validation.artifacts.length, handoffCount: validation.handoffs.length };
}

export async function doctor(rootDirInput: string): Promise<ValidationResult> {
  return validateContextStore(rootDirInput);
}

async function readAssetText(assetDir: "schemas" | "templates", fileName: string): Promise<string> {
  const rootDir = findToolkitRoot();
  return readFile(path.join(rootDir, assetDir, fileName), "utf8");
}

async function readContextTemplate(rootDir: string, templateName: string): Promise<string> {
  const localTemplatePath = path.join(rootDir, "templates", `${templateName}.md`);
  if (existsSync(localTemplatePath)) {
    return readFile(localTemplatePath, "utf8");
  }
  return readAssetText("templates", `${templateName}.md`);
}

async function loadSchemaValidator(rootDir: string, schemaFileName: string): Promise<ValidateFunction> {
  const schemaPath = path.join(rootDir, "schemas", schemaFileName);
  const schemaText = existsSync(schemaPath)
    ? await readFile(schemaPath, "utf8")
    : await readAssetText("schemas", schemaFileName);
  const AjvCtor = ((Ajv2020Module as unknown as { default?: AjvConstructor }).default ?? Ajv2020Module) as AjvConstructor;
  const ajv = new AjvCtor({ allErrors: true, strict: false, validateFormats: false });
  return ajv.compile(JSON.parse(schemaText));
}

function collectSchemaErrors(validator: ValidateFunction, data: unknown, label: string, errors: string[]): void {
  const valid = validator(data);
  if (valid) {
    return;
  }
  for (const error of validator.errors ?? []) {
    const location = error.instancePath || "/";
    errors.push(`${label}: schema ${location} ${error.message ?? "validation failed"}`);
  }
}

function collectHandoffStructuralErrors(rootDir: string, label: string, handoff: Record<string, unknown>, errors: string[]): void {
  const artifacts = handoff["artifacts"];
  if (!isRecord(artifacts)) {
    return;
  }

  const requiredArtifacts = artifacts["required"];
  if (!Array.isArray(requiredArtifacts)) {
    errors.push(`${label}: artifacts.required must be an array`);
    return;
  }

  if (requiredArtifacts.length === 0) {
    errors.push(`${label}: artifacts.required must include at least one artifact`);
  }

  for (const [index, artifact] of requiredArtifacts.entries()) {
    if (!isRecord(artifact)) {
      errors.push(`${label}: artifacts.required[${index}] must be an object`);
      continue;
    }
    const artifactPath = artifact["path"];
    if (typeof artifactPath === "string" && !existsSync(path.join(rootDir, artifactPath))) {
      errors.push(`${label}: referenced artifact does not exist: ${artifactPath}`);
    }
  }

  const readiness = handoff["readiness"];
  if (isRecord(readiness)) {
    const dorStatus = readiness["dor_status"];
    if (typeof dorStatus === "string" && !["pending", "passed", "failed"].includes(dorStatus)) {
      errors.push(`${label}: readiness.dor_status must be pending, passed, or failed`);
    }
  }
}

async function writeIfMissing(rootDir: string, relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(rootDir, relativePath);
  if (existsSync(fullPath)) {
    return;
  }
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((content, [key, value]) => content.replaceAll(`{{${key}}}`, value), template);
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) {
    return {};
  }
  return parseYamlObject(match[1]);
}

function parseYamlObject(content: string): Record<string, unknown> {
  const parsed = parseYaml(content);
  return isRecord(parsed) ? parsed : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function listFiles(rootDir: string, extension: string): Promise<string[]> {
  if (!existsSync(rootDir)) {
    return [];
  }
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry: Dirent) => {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(absolutePath, extension);
    }
    return entry.isFile() && entry.name.endsWith(extension) ? [absolutePath] : [];
  }));
  return files.flat().sort();
}

async function findArtifactsForTask(rootDir: string, taskId: string): Promise<ArtifactRecord[]> {
  const artifactPaths = (await listFiles(path.join(rootDir, "artifacts"), ".md")).filter((file) => path.basename(file).includes(taskId));
  const artifacts: ArtifactRecord[] = [];
  for (const artifactPath of artifactPaths) {
    const content = await readFile(artifactPath, "utf8");
    const metadata = parseFrontmatter(content);
    artifacts.push({
      id: String(metadata["id"] ?? path.basename(artifactPath, ".md")),
      type: String(metadata["type"] ?? "unknown"),
      title: String(metadata["title"] ?? ""),
      version: String(metadata["version"] ?? ""),
      approvalStatus: String(metadata["approval_status"] ?? ""),
      path: toPosix(path.relative(rootDir, artifactPath))
    });
  }
  return artifacts;
}

function stringifyHandoff(input: {
  id: string;
  taskId: string;
  fromRole: string;
  toRole: string;
  artifacts: Array<{ path: string; type: string; version: string; summary: string }>;
}): string {
  const artifactLines = input.artifacts.length === 0
    ? ["    []"]
    : input.artifacts.flatMap((artifact) => [
      `    - path: ${artifact.path}`,
      `      type: ${artifact.type}`,
      `      version: ${artifact.version}`,
      `      summary: "${artifact.summary.replaceAll('"', '\\"')}"`
    ]);

  return [
    `id: ${input.id}`,
    `task_id: ${input.taskId}`,
    `from_role: ${input.fromRole}`,
    `to_role: ${input.toRole}`,
    "handoff_type: role_handoff",
    "status: ready_for_review",
    "approval_status: pending",
    "artifacts:",
    "  required:",
    ...artifactLines,
    "context_summary: \"Minimum context required for the next role.\"",
    "open_questions:",
    "  - \"None yet.\"",
    "readiness:",
    "  dor_status: pending",
    "  blocking_questions: []",
    ""
  ].join("\n");
}

function extractArtifactPaths(content: string): string[] {
  return [...content.matchAll(/path:\s*([^\s]+)/g)].map((match) => match[1]);
}

function resolveHandoffPath(rootDir: string, handoffRef: string): string | null {
  const normalizedRef = handoffRef.endsWith(".yaml") ? handoffRef : `${handoffRef}.yaml`;
  const direct = path.resolve(rootDir, normalizedRef);
  if (existsSync(direct)) {
    return direct;
  }
  const inHandoffs = path.join(rootDir, "handoffs", normalizedRef);
  return existsSync(inHandoffs) ? inHandoffs : null;
}

function handoffMatchesRole(filePath: string, role: string): boolean {
  const baseName = path.basename(filePath).toLowerCase();
  if (role === "sa") {
    return baseName.includes("-ba-sa") || baseName.includes("-sa-");
  }
  if (role === "dev" || role === "developer") {
    return baseName.includes("-sa-dev") || baseName.includes("-dev-");
  }
  if (role === "qa") {
    return baseName.includes("-dev-qa") || baseName.includes("-qa");
  }
  return true;
}

function findToolkitRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  let currentDir = path.dirname(currentFile);
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(currentDir, "schemas")) && existsSync(path.join(currentDir, "templates"))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error("Could not locate agent-context-store schemas/templates assets");
}

async function appendAudit(rootDir: string, message: string): Promise<void> {
  const auditDir = path.join(rootDir, ".context-store/audit");
  await mkdir(auditDir, { recursive: true });
  const filePath = path.join(auditDir, `${today()}.log`);
  const line = `${new Date().toISOString()} ${message}\n`;
  const existing = existsSync(filePath) ? await readFile(filePath, "utf8") : "";
  await writeFile(filePath, existing + line, "utf8");
}

function emptyResult(): AcsResult {
  return { created: [], updated: [], warnings: [] };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}
