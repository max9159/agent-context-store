import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, type Dirent } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import * as Ajv2020Module from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import { parse as parseYaml } from "yaml";

// ─── Public types ────────────────────────────────────────────────────────────

export type StoreMode = "in-repo" | "local" | "dedicated";

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

export interface StoreInfo {
  projectDir: string;
  storeDir: string;
  mode: StoreMode;
  initialized: boolean;
  configPresent: boolean;
  schemasPresent: boolean;
}

export interface InitOptions {
  /** Project root for in-repo/local modes; store root for dedicated mode. */
  rootDir: string;
  /** Defaults to "in-repo". */
  mode?: StoreMode;
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

// ─── Internal types ──────────────────────────────────────────────────────────

interface StoreContext {
  projectDir: string;
  storeDir: string;
  mode: StoreMode;
}

type AjvConstructor = new (options: { allErrors: boolean; strict: boolean; validateFormats: boolean }) => {
  compile(schema: unknown): ValidateFunction;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const artifactDefinitions: Record<ArtifactType, { dir: string; prefix: string; owner: string; template: string }> = {
  srs: { dir: "artifacts/requirements", prefix: "REQ", owner: "ba_agent", template: "srs" },
  sdd: { dir: "artifacts/design", prefix: "SDD", owner: "sa_agent", template: "sdd" },
  adr: { dir: "artifacts/adr", prefix: "ADR", owner: "sa_agent", template: "adr" },
  api: { dir: "artifacts/api", prefix: "API", owner: "sa_agent", template: "api-design" },
  test: { dir: "artifacts/test", prefix: "TC", owner: "qa_agent", template: "test-plan" }
};

/** Directories created inside the store root during init. */
const layoutDirectories = [
  "audit",
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

// ─── Store resolution ────────────────────────────────────────────────────────

/**
 * Determine the store root (storeDir) from an input directory.
 *
 * Detection order:
 * 1. <inputDir>/.acs/config.yaml  → in-repo (or local if mode=local)
 * 2. <inputDir>/config.yaml with mode:dedicated → dedicated
 * 3. local registry project mapping → local
 * 4. Fallback: in-repo with storeDir=<inputDir>/.acs (uninitialized)
 */
function resolveStoreContext(inputDir: string): StoreContext {
  const projectDir = path.resolve(inputDir);
  const acsDir = path.join(projectDir, ".acs");
  const acsConfigPath = path.join(acsDir, "config.yaml");

  if (existsSync(acsConfigPath)) {
    try {
      const cfg = parseYamlObject(readFileSync(acsConfigPath, "utf8"));
      if (cfg["mode"] === "local" && typeof cfg["store_path"] === "string") {
        return { projectDir, storeDir: cfg["store_path"] as string, mode: "local" };
      }
    } catch {
      // parse error — treat as in-repo
    }
    return { projectDir, storeDir: acsDir, mode: "in-repo" };
  }

  // Check dedicated: config.yaml at the root with mode marker
  const dedicatedConfigPath = path.join(projectDir, "config.yaml");
  if (existsSync(dedicatedConfigPath)) {
    try {
      const cfg = parseYamlObject(readFileSync(dedicatedConfigPath, "utf8"));
      if (cfg["mode"] === "dedicated") {
        return { projectDir, storeDir: projectDir, mode: "dedicated" };
      }
    } catch {
      // ignore
    }
  }

  const registeredLocalStore = readLocalStoreRegistration(projectDir);
  if (registeredLocalStore) {
    return { projectDir, storeDir: registeredLocalStore, mode: "local" };
  }

  // Not initialized — default in-repo (will produce validation errors)
  return { projectDir, storeDir: acsDir, mode: "in-repo" };
}

/** OS user-data base directory for local mode. */
function getLocalBaseDir(): string {
  const home = os.homedir();
  if (process.platform === "win32") {
    return path.join(process.env["APPDATA"] ?? path.join(home, "AppData", "Roaming"), "agent-context-store");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "agent-context-store");
  }
  return path.join(home, ".local", "share", "agent-context-store");
}

/** Derive a filesystem-safe slug from a project directory path. */
function computeProjectSlug(projectDir: string): string {
  const basename = path.basename(projectDir);
  let hash = 0;
  for (const char of projectDir) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return `${basename}-${Math.abs(hash).toString(16).padStart(8, "0").slice(0, 8)}`;
}

function getLocalRegistryPath(): string {
  return path.join(getLocalBaseDir(), "projects.json");
}

function getProjectRegistryKey(projectDir: string): string {
  const resolved = path.resolve(projectDir);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function readLocalRegistry(): Record<string, string> {
  const registryPath = getLocalRegistryPath();
  if (!existsSync(registryPath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(readFileSync(registryPath, "utf8")) as unknown;
    return isRecord(parsed)
      ? Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string")) as Record<string, string>
      : {};
  } catch {
    return {};
  }
}

function readLocalStoreRegistration(projectDir: string): string | null {
  const registry = readLocalRegistry();
  return registry[getProjectRegistryKey(projectDir)] ?? null;
}

async function writeLocalStoreRegistration(projectDir: string, storeDir: string, result: AcsResult): Promise<void> {
  const registryPath = getLocalRegistryPath();
  const registry = readLocalRegistry();
  const key = getProjectRegistryKey(projectDir);
  if (registry[key] === storeDir) {
    return;
  }
  registry[key] = storeDir;
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeFile(registryPath, JSON.stringify(registry, null, 2), "utf8");
  result.updated.push(toPosix(registryPath));
}

/**
 * Convert a store-relative path to a result path that is:
 * - relative to projectDir if storeDir is inside projectDir
 * - absolute otherwise (e.g. local mode where store is in user-data dir)
 */
function toResultPath(storeDir: string, projectDir: string, relPath: string): string {
  const abs = path.join(storeDir, relPath);
  const rel = path.relative(projectDir, abs);
  return toPosix(rel.startsWith("..") ? abs : rel);
}

/**
 * Convert a result path (project-relative or absolute) back to a store-relative path.
 * Used when writing paths into YAML that will later be resolved relative to storeDir.
 */
function toStoreRelPath(resultPath: string, storeDir: string, projectDir: string): string {
  const abs = path.isAbsolute(resultPath) ? resultPath : path.join(projectDir, resultPath);
  return toPosix(path.relative(storeDir, abs));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getStoreInfo(rootDirInput: string): Promise<StoreInfo> {
  const ctx = resolveStoreContext(rootDirInput);
  const configPresent = existsSync(path.join(ctx.storeDir, "config.yaml"));
  const schemasPresent = schemaFileNames.every((fileName) => existsSync(path.join(ctx.storeDir, "schemas", fileName)));
  const initialized = configPresent;
  return { ...ctx, initialized, configPresent, schemasPresent };
}

export async function initContextStore(options: InitOptions): Promise<AcsResult> {
  const projectDir = path.resolve(options.rootDir);
  const mode = options.mode ?? "in-repo";
  const result = emptyResult();

  let storeDir: string;

  if (mode === "in-repo") {
    storeDir = path.join(projectDir, ".acs");
  } else if (mode === "dedicated") {
    storeDir = projectDir;
  } else {
    const slug = computeProjectSlug(projectDir);
    storeDir = path.join(getLocalBaseDir(), "stores", slug);
    await writeLocalStoreRegistration(projectDir, storeDir, result);
  }

  // Create layout dirs inside storeDir
  for (const dir of layoutDirectories) {
    const fullPath = path.join(storeDir, dir);
    if (!existsSync(fullPath)) {
      await mkdir(fullPath, { recursive: true });
      result.created.push(toResultPath(storeDir, projectDir, dir));
    }
  }

  const configContent = mode === "local"
    ? `version: 1\ntoolkit: agent-context-store\ncli: acs\nmode: local\nproject_path: ${projectDir.replaceAll("\\", "/")}\n`
    : `version: 1\ntoolkit: agent-context-store\ncli: acs\nmode: ${mode}\n`;

  await writeIfMissing(storeDir, projectDir, "config.yaml", configContent, result);
  await writeIfMissing(storeDir, projectDir, "index.json", JSON.stringify({ generated_at: null, artifacts: [], handoffs: [] }, null, 2), result);

  for (const fileName of schemaFileNames) {
    await writeIfMissing(storeDir, projectDir, `schemas/${fileName}`, await readAssetText("schemas", fileName), result);
  }

  for (const fileName of templateFileNames) {
    await writeIfMissing(storeDir, projectDir, `templates/${fileName}`, await readAssetText("templates", fileName), result);
  }

  await writeIfMissing(storeDir, projectDir, "docs/definition-of-ready.md", "# Definition of Ready\n\n- Required fields are present.\n- Artifact IDs are stable.\n- Source references are recorded.\n- Open questions are explicit.\n", result);
  await writeIfMissing(storeDir, projectDir, "docs/definition-of-done.md", "# Definition of Done\n\n- Artifacts are validated.\n- Handoff packages are present.\n- Context package can be generated for the next role.\n", result);
  await writeIfMissing(storeDir, projectDir, "docs/source-reference-rules.md", "# Source Reference Rules\n\nPrefer approved artifacts, issues, commits, PRs, and meeting notes over chat history.\n", result);
  await writeIfMissing(storeDir, projectDir, "docs/approval-state-rules.md", "# Approval State Rules\n\nValid states: draft, ready_for_review, changes_requested, approved, deprecated, superseded.\n", result);

  return result;
}

export async function createArtifact(options: CreateArtifactOptions): Promise<AcsResult & { artifactPath: string; artifactId: string }> {
  const { projectDir, storeDir } = resolveStoreContext(options.rootDir);
  const definition = artifactDefinitions[options.type];
  const artifactId = `${definition.prefix}-${options.taskId}`;
  const title = options.title ?? `${artifactId} ${options.type.toUpperCase()}`;
  const storeRelPath = `${definition.dir}/${artifactId}.md`;
  const targetPath = path.join(storeDir, storeRelPath);

  if (existsSync(targetPath)) {
    throw new Error(`Artifact already exists: ${storeRelPath}`);
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  const template = await readContextTemplate(storeDir, definition.template);
  const content = renderTemplate(template, {
    ARTIFACT_ID: artifactId,
    TITLE: title,
    DATE: today()
  });
  await writeFile(targetPath, content, "utf8");
  await appendAudit(storeDir, `created artifact ${storeRelPath}`);

  const resultPath = toResultPath(storeDir, projectDir, storeRelPath);
  return { ...emptyResult(), artifactPath: resultPath, artifactId, created: [resultPath] };
}

export async function validateContextStore(rootDirInput: string): Promise<ValidationResult> {
  const { projectDir, storeDir } = resolveStoreContext(rootDirInput);
  const errors: string[] = [];
  const warnings: string[] = [];
  const artifactValidator = await loadSchemaValidator(storeDir, "artifact.schema.json");
  const handoffValidator = await loadSchemaValidator(storeDir, "handoff.schema.json");

  for (const dir of layoutDirectories) {
    if (!existsSync(path.join(storeDir, dir))) {
      errors.push(`Missing directory: ${dir}`);
    }
  }

  const artifactPaths = await listFiles(path.join(storeDir, "artifacts"), ".md");
  const artifacts: ArtifactRecord[] = [];
  for (const absolutePath of artifactPaths) {
    const storeRelPath = toPosix(path.relative(storeDir, absolutePath));
    const resultPath = toResultPath(storeDir, projectDir, toPosix(path.relative(storeDir, absolutePath)));
    const content = await readFile(absolutePath, "utf8");
    const metadata = parseFrontmatter(content);
    collectSchemaErrors(artifactValidator, metadata, resultPath, errors);
    if (metadata["approval_status"] === "approved" && metadata["status"] !== "approved") {
      warnings.push(`${resultPath}: approval_status is approved but status is ${String(metadata["status"] ?? "missing")}`);
    }
    artifacts.push({
      id: String(metadata["id"] ?? path.basename(absolutePath, ".md")),
      type: String(metadata["type"] ?? "unknown"),
      title: String(metadata["title"] ?? ""),
      version: String(metadata["version"] ?? ""),
      approvalStatus: String(metadata["approval_status"] ?? ""),
      path: resultPath
    });
  }

  const handoffPaths = await listFiles(path.join(storeDir, "handoffs"), ".yaml");
  for (const handoffPath of handoffPaths) {
    const resultPath = toResultPath(storeDir, projectDir, toPosix(path.relative(storeDir, handoffPath)));
    const content = await readFile(handoffPath, "utf8");
    const handoff = parseYamlObject(content);
    collectSchemaErrors(handoffValidator, handoff, resultPath, errors);
    collectHandoffStructuralErrors(storeDir, resultPath, handoff, errors);
    for (const artifactRef of extractArtifactPaths(content)) {
      if (!existsSync(path.join(storeDir, artifactRef))) {
        errors.push(`${resultPath}: referenced artifact does not exist: ${artifactRef}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    artifacts,
    handoffs: handoffPaths.map((file) => toResultPath(storeDir, projectDir, toPosix(path.relative(storeDir, file))))
  };
}

export async function createHandoff(options: CreateHandoffOptions): Promise<AcsResult & { handoffPath: string; handoffId: string }> {
  const { projectDir, storeDir } = resolveStoreContext(options.rootDir);
  const fromRole = options.fromRole.toUpperCase();
  const toRole = options.toRole.toUpperCase();
  const handoffId = `HOFF-${options.taskId}-${fromRole}-${toRole}`;
  const storeRelPath = `handoffs/${handoffId}.yaml`;
  const targetPath = path.join(storeDir, storeRelPath);

  if (existsSync(targetPath)) {
    throw new Error(`Handoff already exists: ${storeRelPath}`);
  }

  const artifacts = (await findArtifactsForTask(storeDir, projectDir, options.taskId)).map((artifact) => ({
    // Write store-relative paths in YAML so checkHandoff can resolve them against storeDir
    path: toStoreRelPath(artifact.path, storeDir, projectDir),
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
  await appendAudit(storeDir, `created handoff ${storeRelPath}`);

  const resultPath = toResultPath(storeDir, projectDir, storeRelPath);
  return { ...emptyResult(), handoffPath: resultPath, handoffId, created: [resultPath] };
}

export async function checkHandoff(rootDirInput: string, handoffRef: string): Promise<ValidationResult> {
  const { projectDir, storeDir } = resolveStoreContext(rootDirInput);
  const handoffPath = resolveHandoffPath(storeDir, projectDir, handoffRef);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!handoffPath || !existsSync(handoffPath)) {
    errors.push(`Handoff not found: ${handoffRef}`);
    return { valid: false, errors, warnings, artifacts: [], handoffs: [] };
  }

  const content = await readFile(handoffPath, "utf8");
  const handoff = parseYamlObject(content);
  const handoffValidator = await loadSchemaValidator(storeDir, "handoff.schema.json");
  const resultPath = toResultPath(storeDir, projectDir, toPosix(path.relative(storeDir, handoffPath)));
  collectSchemaErrors(handoffValidator, handoff, resultPath, errors);
  collectHandoffStructuralErrors(storeDir, resultPath, handoff, errors);
  for (const artifactRef of extractArtifactPaths(content)) {
    if (!existsSync(path.join(storeDir, artifactRef))) {
      errors.push(`Referenced artifact does not exist: ${artifactRef}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    artifacts: [],
    handoffs: [resultPath]
  };
}

export async function buildContextPackage(options: BuildContextPackageOptions): Promise<AcsResult & { packagePath: string }> {
  const { projectDir, storeDir } = resolveStoreContext(options.rootDir);
  const format = options.format ?? "markdown";
  const allArtifacts = await findArtifactsForTask(storeDir, projectDir, options.taskId);
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

  const handoffs = (await listFiles(path.join(storeDir, "handoffs"), ".yaml"))
    .filter((file) => path.basename(file).includes(options.taskId))
    .filter((file) => handoffMatchesRole(file, role))
    .map((file) => toResultPath(storeDir, projectDir, toPosix(path.relative(storeDir, file))));

  const packageStoreRel = `packages/${options.taskId}.${options.role}.context.${format === "json" ? "json" : "md"}`;
  const targetPath = path.join(storeDir, packageStoreRel);
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

  await appendAudit(storeDir, `built context package ${packageStoreRel}`);
  const resultPath = toResultPath(storeDir, projectDir, packageStoreRel);
  return { ...emptyResult(), packagePath: resultPath, created: [resultPath] };
}

export async function buildIndex(rootDirInput: string): Promise<AcsResult & { artifactCount: number; handoffCount: number }> {
  const { projectDir, storeDir } = resolveStoreContext(rootDirInput);
  const validation = await validateContextStore(rootDirInput);
  const index = {
    generated_at: new Date().toISOString(),
    artifacts: validation.artifacts,
    handoffs: validation.handoffs
  };
  await mkdir(storeDir, { recursive: true });
  await writeFile(path.join(storeDir, "index.json"), JSON.stringify(index, null, 2), "utf8");
  await appendAudit(storeDir, "rebuilt index");
  const resultPath = toResultPath(storeDir, projectDir, "index.json");
  return { ...emptyResult(), updated: [resultPath], artifactCount: validation.artifacts.length, handoffCount: validation.handoffs.length };
}

export async function doctor(rootDirInput: string): Promise<ValidationResult> {
  return validateContextStore(rootDirInput);
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function readAssetText(assetDir: "schemas" | "templates", fileName: string): Promise<string> {
  const rootDir = findToolkitRoot();
  return readFile(path.join(rootDir, assetDir, fileName), "utf8");
}

async function readContextTemplate(storeDir: string, templateName: string): Promise<string> {
  const localTemplatePath = path.join(storeDir, "templates", `${templateName}.md`);
  if (existsSync(localTemplatePath)) {
    return readFile(localTemplatePath, "utf8");
  }
  return readAssetText("templates", `${templateName}.md`);
}

async function loadSchemaValidator(storeDir: string, schemaFileName: string): Promise<ValidateFunction> {
  const schemaPath = path.join(storeDir, "schemas", schemaFileName);
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

function collectHandoffStructuralErrors(storeDir: string, label: string, handoff: Record<string, unknown>, errors: string[]): void {
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
    if (typeof artifactPath === "string" && !existsSync(path.join(storeDir, artifactPath))) {
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

/** Write a file inside storeDir if it does not already exist, tracking result paths relative to projectDir. */
async function writeIfMissing(
  storeDir: string,
  projectDir: string,
  relPath: string,
  content: string,
  result: AcsResult
): Promise<void> {
  const fullPath = path.join(storeDir, relPath);
  if (existsSync(fullPath)) {
    return;
  }
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  result.created.push(toResultPath(storeDir, projectDir, relPath));
}

/** Write a file at an absolute path if it does not already exist, using a provided display label. */
async function writeIfMissingRaw(
  fullPath: string,
  content: string,
  result: AcsResult,
  displayLabel: string
): Promise<void> {
  if (existsSync(fullPath)) {
    return;
  }
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  result.created.push(displayLabel);
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

async function findArtifactsForTask(storeDir: string, projectDir: string, taskId: string): Promise<ArtifactRecord[]> {
  const artifactPaths = (await listFiles(path.join(storeDir, "artifacts"), ".md")).filter((file) => path.basename(file).includes(taskId));
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
      path: toResultPath(storeDir, projectDir, toPosix(path.relative(storeDir, artifactPath)))
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

function resolveHandoffPath(storeDir: string, projectDir: string, handoffRef: string): string | null {
  const normalizedRef = handoffRef.endsWith(".yaml") ? handoffRef : `${handoffRef}.yaml`;
  const direct = path.resolve(storeDir, normalizedRef);
  if (existsSync(direct)) {
    return direct;
  }
  const projectRelative = path.resolve(projectDir, normalizedRef);
  if (existsSync(projectRelative)) {
    return projectRelative;
  }
  const inHandoffs = path.join(storeDir, "handoffs", normalizedRef);
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

async function appendAudit(storeDir: string, message: string): Promise<void> {
  const auditDir = path.join(storeDir, "audit");
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
