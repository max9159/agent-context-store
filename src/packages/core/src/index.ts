import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import * as Ajv2020Module from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import { parse as parseYaml } from "yaml";

// ─── Public types ────────────────────────────────────────────────────────────

export type StoreMode = "in-repo" | "local" | "dedicated";

export type ArtifactType = string;

/**
 * Validation/handoff policy strictness.
 * - "strict"  (default): upstream artifacts are required; missing inputs are errors.
 * - "relaxed": missing upstream inputs are warnings + AI hints, allowing any role
 *              to be a workflow entry point.
 */
export type AcsMode = "strict" | "relaxed";

export interface AcsHint {
  for: "ai" | "human";
  message: string;
}

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
  hints?: AcsHint[];
  mode?: AcsMode;
}

export interface RoleExplanation {
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
}

export interface NextActionsResult {
  role: string;
  taskId: string;
  currentStage?: string;
  requiredInputs: Array<{ type: string; found: boolean }>;
  suggestedOutputs: string[];
  suggestedCommands: string[];
  mode?: AcsMode;
  hints?: AcsHint[];
}

export interface TaskOverview {
  taskId: string;
  rolesWithArtifacts: string[];
  artifactCount: number;
  suggestedNextRole: string;
  isEntry: boolean;
}

export interface AuditLogEvent {
  ts?: string;
  action: string;
  role?: string;
  task_id?: string;
  artifact?: string;
  handoff?: string;
  from?: string;
  to?: string;
  session_id?: string;
  mode?: AcsMode;
  [key: string]: unknown;
}

export interface ReadTaskLogOptions {
  rootDir: string;
  taskId: string;
  tail?: number;
}

export interface ArtifactRecord {
  id: string;
  type: string;
  title: string;
  version: string;
  status: string;
  approvalStatus: string;
  path: string;
}

export interface StoreInfo {
  projectDir: string;
  storeDir: string;
  policyPath?: string;
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
  /**
   * For dedicated mode only: the project directory that is linking to the store.
   * When provided (and different from rootDir), a .acs/config.yaml pointer is
   * written in this directory so that `acs status` resolves correctly from it.
   */
  projectDir?: string;
}

export interface CreateArtifactOptions {
  rootDir: string;
  type: ArtifactType;
  taskId: string;
  title?: string;
  role?: string;
}

export interface CreateHandoffOptions {
  rootDir: string;
  fromRole: string;
  toRole: string;
  taskId: string;
  mode?: AcsMode;
}

export interface BuildContextPackageOptions {
  rootDir: string;
  taskId: string;
  role: string;
  format?: "markdown" | "json";
}

export interface ExplainRoleOptions {
  rootDir: string;
  role: string;
  taskId?: string;
}

export interface NextActionsOptions {
  rootDir: string;
  role: string;
  taskId: string;
  mode?: AcsMode;
}

export interface CheckHandoffOptions {
  rootDir: string;
  fromRole: string;
  toRole: string;
  taskId: string;
  mode?: AcsMode;
}

export interface ListHandoffsOptions {
  rootDir: string;
  taskId?: string;
  role?: string;
}

export interface ValidateScopeOptions {
  rootDir: string;
  role?: string;
  taskId?: string;
  artifactPath?: string;
  mode?: AcsMode;
}

// ─── Internal types ──────────────────────────────────────────────────────────

interface StoreContext {
  projectDir: string;
  storeDir: string;
  mode: StoreMode;
}

interface RoleProfile {
  role: string;
  displayName: string;
  canCreate: string[];
  canRead: string[];
  canUpdate: string[];
  defaultTemplates: Record<string, string>;
  handoffTargets: string[];
  packageInclude: string[];
  packageExclude: string[];
}

interface ArtifactTypeDefinition {
  type: string;
  displayName: string;
  template: string;
  idPrefix: string;
  owner: string;
  pathTemplate?: string;
  schema?: string;
  aliases: string[];
  allowedCreate: string[];
  allowedUpdate: string[];
  allowedRead: string[];
  requiredFields: string[];
}

interface WorkflowStage {
  id: string;
  name: string;
  owner: string;
  inputs: string[];
  outputs: string[];
  next: string[];
}

interface HandoffRule {
  from: string;
  to: string;
  requiredArtifacts: string[];
  requiredState: string;
}

interface AcsPolicy {
  roles: RoleProfile[];
  artifactTypes: ArtifactTypeDefinition[];
  aliases: Record<string, string>;
  naming: {
    artifactPath: string;
    handoffPath: string;
    packagePath: string;
  };
  workflow: {
    stages: WorkflowStage[];
    handoffRules: HandoffRule[];
  };
}

type AjvConstructor = new (options: { allErrors: boolean; strict: boolean; validateFormats: boolean }) => {
  compile(schema: unknown): ValidateFunction;
};

// ─── Constants ───────────────────────────────────────────────────────────────

/** Directories created inside the store root during init. */
const layoutDirectories = [
  "audit",
  "artifacts",
  "handoffs",
  "summaries",
  "packages",
  "schemas",
  "templates",
  "roles",
  "artifact-types",
  "workflows",
  "docs"
];

const schemaFileNames = [
  "artifact.schema.json",
  "handoff.schema.json",
  "context-summary.schema.json",
  "context-package.schema.json",
  "approval.schema.json",
  "acs.schema.json",
  "role.schema.json",
  "artifact-type.schema.json",
  "workflow.schema.json"
];

const templateFileNames = [
  "srs.md",
  "sdd.md",
  "adr.md",
  "api-design.md",
  "user-story.md",
  "acceptance-criteria.md",
  "implementation-note.md",
  "unit-test-note.md",
  "code-review-note.md",
  "test-plan.md",
  "test-case.md",
  "defect-report.md",
  "qa-signoff.md",
  "release-readiness-report.md"
];

const roleFileNames = ["ba.yaml", "sa.yaml", "dev.yaml", "qa.yaml"];
const artifactTypeFileNames = [
  "srs.yaml",
  "user-story.yaml",
  "acceptance-criteria.yaml",
  "sdd.yaml",
  "adr.yaml",
  "api-design.yaml",
  "implementation-note.yaml",
  "unit-test-note.yaml",
  "code-review-note.yaml",
  "test-plan.yaml",
  "test-case.yaml",
  "defect-report.yaml",
  "qa-signoff.yaml",
  "release-readiness-report.yaml",
  "handoff-package.yaml",
  "context-package.yaml"
];
const workflowFileNames = ["default-sdlc.yaml"];

const defaultPolicy: AcsPolicy = {
  roles: [
    {
      role: "ba",
      displayName: "Business Analyst",
      canCreate: ["srs", "user-story", "acceptance-criteria", "handoff-package"],
      canRead: ["srs", "user-story", "acceptance-criteria", "source-reference"],
      canUpdate: ["srs", "user-story", "acceptance-criteria"],
      defaultTemplates: { srs: "srs.md", "user-story": "user-story.md", "acceptance-criteria": "acceptance-criteria.md" },
      handoffTargets: ["sa"],
      packageInclude: ["srs", "user-story", "acceptance-criteria", "open-question"],
      packageExclude: ["implementation-note", "defect-report"]
    },
    {
      role: "sa",
      displayName: "System Architect",
      canCreate: ["sdd", "adr", "api-design", "handoff-package"],
      canRead: ["srs", "user-story", "acceptance-criteria", "sdd", "adr", "api-design"],
      canUpdate: ["sdd", "adr", "api-design"],
      defaultTemplates: { sdd: "sdd.md", adr: "adr.md", "api-design": "api-design.md" },
      handoffTargets: ["dev", "qa"],
      packageInclude: ["srs", "user-story", "acceptance-criteria", "sdd", "adr", "api-design", "source-reference"],
      packageExclude: []
    },
    {
      role: "dev",
      displayName: "Developer",
      canCreate: ["implementation-note", "unit-test-note", "code-review-note", "handoff-package"],
      canRead: ["srs", "sdd", "adr", "api-design", "implementation-note", "test-plan"],
      canUpdate: ["implementation-note", "unit-test-note"],
      defaultTemplates: { "implementation-note": "implementation-note.md", "unit-test-note": "unit-test-note.md" },
      handoffTargets: ["qa"],
      packageInclude: ["srs", "sdd", "adr", "api-design", "implementation-note"],
      packageExclude: ["raw-meeting-notes", "unrelated-research"]
    },
    {
      role: "qa",
      displayName: "QA Tester",
      canCreate: ["test-plan", "test-case", "defect-report", "qa-signoff"],
      canRead: ["srs", "sdd", "adr", "api-design", "implementation-note", "test-plan", "defect-report"],
      canUpdate: ["test-plan", "test-case", "defect-report", "qa-signoff"],
      defaultTemplates: { "test-plan": "test-plan.md", "test-case": "test-case.md", "defect-report": "defect-report.md" },
      handoffTargets: ["dev", "sa"],
      packageInclude: ["srs", "sdd", "adr", "api-design", "implementation-note", "acceptance-criteria"],
      packageExclude: ["internal-dev-notes"]
    }
  ],
  artifactTypes: [],
  aliases: { api: "api-design", test: "test-plan", developer: "dev", reviewer: "qa" },
  naming: {
    artifactPath: "artifacts/{type}/{artifact_id}.{ext}",
    handoffPath: "handoffs/{task_id}/{handoff_id}.yaml",
    packagePath: "packages/{task_id}/{role}.context.{ext}"
  },
  workflow: {
    stages: [
      { id: "requirement", name: "Requirement Analysis", owner: "ba", inputs: [], outputs: ["srs", "user-story", "acceptance-criteria"], next: ["system-design"] },
      { id: "system-design", name: "System Design", owner: "sa", inputs: ["srs", "user-story", "acceptance-criteria"], outputs: ["sdd", "adr", "api-design"], next: ["development"] },
      { id: "development", name: "Development", owner: "dev", inputs: ["srs", "sdd", "adr", "api-design"], outputs: ["implementation-note", "unit-test-note"], next: ["qa-test"] },
      { id: "qa-test", name: "QA Test", owner: "qa", inputs: ["srs", "sdd", "adr", "api-design", "implementation-note"], outputs: ["test-plan", "test-case", "defect-report", "qa-signoff"], next: ["release-readiness"] },
      { id: "release-readiness", name: "Release Readiness", owner: "sa", inputs: ["implementation-note", "test-plan", "qa-signoff"], outputs: ["release-readiness-report"], next: [] }
    ],
    handoffRules: [
      { from: "system", to: "ba", requiredArtifacts: [], requiredState: "any" },
      { from: "system", to: "sa", requiredArtifacts: [], requiredState: "any" },
      { from: "system", to: "dev", requiredArtifacts: [], requiredState: "any" },
      { from: "system", to: "qa", requiredArtifacts: [], requiredState: "any" },
      { from: "ba", to: "sa", requiredArtifacts: ["srs", "user-story", "acceptance-criteria"], requiredState: "approved" },
      { from: "sa", to: "dev", requiredArtifacts: ["srs", "sdd", "adr", "api-design"], requiredState: "approved" },
      { from: "dev", to: "qa", requiredArtifacts: ["implementation-note", "unit-test-note"], requiredState: "ready_for_review" },
      { from: "qa", to: "sa", requiredArtifacts: ["test-plan", "qa-signoff"], requiredState: "approved" }
    ]
  }
};

defaultPolicy.artifactTypes = [
  defineArtifact("srs", "Software Requirements Specification", "srs.md", "SRS", "ba", ["ba"], ["ba"], ["ba", "sa", "dev", "qa"], ["task_id", "title"]),
  defineArtifact("user-story", "User Story", "user-story.md", "US", "ba", ["ba"], ["ba"], ["ba", "sa", "dev", "qa"], ["task_id", "title"]),
  defineArtifact("acceptance-criteria", "Acceptance Criteria", "acceptance-criteria.md", "AC", "ba", ["ba"], ["ba"], ["ba", "sa", "dev", "qa"], ["task_id", "title"]),
  defineArtifact("sdd", "System Design Document", "sdd.md", "SDD", "sa", ["sa"], ["sa"], ["ba", "sa", "dev", "qa"], ["task_id", "title"]),
  defineArtifact("adr", "Architecture Decision Record", "adr.md", "ADR", "sa", ["sa"], ["sa"], ["sa", "dev", "qa"], ["decision", "context", "consequences"]),
  defineArtifact("api-design", "API Design", "api-design.md", "API", "sa", ["sa"], ["sa"], ["sa", "dev", "qa"], ["task_id", "title"], ["api"]),
  defineArtifact("implementation-note", "Implementation Note", "implementation-note.md", "IMPL", "dev", ["dev"], ["dev"], ["sa", "dev", "qa"], ["task_id", "changed_files"]),
  defineArtifact("unit-test-note", "Unit Test Note", "unit-test-note.md", "UNIT", "dev", ["dev"], ["dev"], ["dev", "qa"], ["task_id", "unit_tests"]),
  defineArtifact("code-review-note", "Code Review Note", "code-review-note.md", "CR", "dev", ["dev"], ["dev"], ["dev", "qa"], ["task_id", "review_summary"]),
  defineArtifact("test-plan", "Test Plan", "test-plan.md", "TEST", "qa", ["qa"], ["qa"], ["sa", "dev", "qa"], ["task_id", "test_scope"], ["test"]),
  defineArtifact("test-case", "Test Case", "test-case.md", "TC", "qa", ["qa"], ["qa"], ["dev", "qa"], ["task_id", "test_steps"]),
  defineArtifact("defect-report", "Defect Report", "defect-report.md", "BUG", "qa", ["qa"], ["qa"], ["dev", "qa"], ["task_id", "actual_result"]),
  defineArtifact("qa-signoff", "QA Signoff", "qa-signoff.md", "QA", "qa", ["qa"], ["qa"], ["sa", "dev", "qa"], ["task_id", "signoff_state"]),
  defineArtifact("release-readiness-report", "Release Readiness Report", "release-readiness-report.md", "REL", "sa", ["sa"], ["sa"], ["sa", "dev", "qa"], ["task_id", "release_decision"]),
  defineArtifact("handoff-package", "Handoff Package", "implementation-note.md", "HO", "system", ["ba", "sa", "dev"], ["ba", "sa", "dev"], ["ba", "sa", "dev", "qa"], ["task_id"]),
  defineArtifact("context-package", "Context Package", "implementation-note.md", "CTX", "system", [], [], ["ba", "sa", "dev", "qa"], ["task_id"])
];

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
      if (cfg["mode"] === "dedicated" && typeof cfg["store_path"] === "string") {
        return { projectDir, storeDir: cfg["store_path"] as string, mode: "dedicated" };
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
  if (process.platform === "win32") {
    const appdata = process.env["APPDATA"] ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appdata, "agent-context-store");
  }
  if (process.platform === "darwin") {
    const home = process.env["HOME"] ?? os.homedir();
    return path.join(home, "Library", "Application Support", "agent-context-store");
  }
  const xdgData = process.env["XDG_DATA_HOME"] ?? path.join(process.env["HOME"] ?? os.homedir(), ".local", "share");
  return path.join(xdgData, "agent-context-store");
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
  const policyPath = path.join(ctx.storeDir, "acs.yaml");
  const initialized = configPresent;
  return { ...ctx, policyPath, initialized, configPresent, schemasPresent };
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
    // If the caller is a project dir separate from the store, write a pointer
    // so that `acs status` (and other commands) resolve correctly from that dir.
    const callerDir = options.projectDir ? path.resolve(options.projectDir) : null;
    if (callerDir && callerDir !== storeDir) {
      const pointerPath = path.join(callerDir, ".acs", "config.yaml");
      const pointerContent = `version: 1\ntoolkit: agent-context-store\ncli: acs\nmode: dedicated\nstore_path: ${storeDir.replaceAll("\\", "/")}\n`;
      await writeIfMissingRaw(pointerPath, pointerContent, result, ".acs/config.yaml");
    }
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
  await writeIfMissing(storeDir, projectDir, "acs.yaml", stringifyAcsConfig(defaultPolicy, mode, projectDir), result);

  for (const fileName of schemaFileNames) {
    await writeIfMissing(storeDir, projectDir, `schemas/${fileName}`, defaultSchemaText(fileName) ?? await readAssetText("schemas", fileName), result);
  }

  for (const fileName of templateFileNames) {
    await writeIfMissing(storeDir, projectDir, `templates/${fileName}`, defaultTemplateText(fileName) ?? await readAssetText("templates", fileName), result);
  }

  for (const fileName of roleFileNames) {
    await writeIfMissing(storeDir, projectDir, `roles/${fileName}`, stringifyRole(defaultPolicy.roles.find((role) => `${role.role}.yaml` === fileName)!), result);
  }

  for (const fileName of artifactTypeFileNames) {
    const type = defaultPolicy.artifactTypes.find((artifactType) => `${artifactType.type}.yaml` === fileName);
    if (type) {
      await writeIfMissing(storeDir, projectDir, `artifact-types/${fileName}`, stringifyArtifactType(type), result);
    }
  }

  for (const fileName of workflowFileNames) {
    await writeIfMissing(storeDir, projectDir, `workflows/${fileName}`, stringifyWorkflow(defaultPolicy), result);
  }

  await writeIfMissing(storeDir, projectDir, "docs/definition-of-ready.md", "# Definition of Ready\n\n- Required fields are present.\n- Artifact IDs are stable.\n- Source references are recorded.\n- Open questions are explicit.\n", result);
  await writeIfMissing(storeDir, projectDir, "docs/definition-of-done.md", "# Definition of Done\n\n- Artifacts are validated.\n- Handoff packages are present.\n- Context package can be generated for the next role.\n", result);
  await writeIfMissing(storeDir, projectDir, "docs/source-reference-rules.md", "# Source Reference Rules\n\nPrefer approved artifacts, issues, commits, PRs, and meeting notes over chat history.\n", result);
  await writeIfMissing(storeDir, projectDir, "docs/approval-state-rules.md", "# Approval State Rules\n\nValid states: draft, ready_for_review, changes_requested, approved, deprecated, superseded.\n", result);

  return result;
}

export async function listRoles(rootDir: string): Promise<RoleProfile[]> {
  const policy = await loadPolicy(rootDir);
  return policy.roles;
}

export async function loadPolicy(rootDirInput: string): Promise<AcsPolicy> {
  const { storeDir } = resolveStoreContext(rootDirInput);
  const policy = cloneDefaultPolicy();
  const acsConfigPath = path.join(storeDir, "acs.yaml");

  if (existsSync(acsConfigPath)) {
    const config = parseYamlObject(await readFile(acsConfigPath, "utf8"));
    const naming = config["naming"];
    if (isRecord(naming)) {
      policy.naming.artifactPath = stringValue(naming["artifact_path"]) ?? policy.naming.artifactPath;
      policy.naming.handoffPath = stringValue(naming["handoff_path"]) ?? policy.naming.handoffPath;
      policy.naming.packagePath = stringValue(naming["package_path"]) ?? policy.naming.packagePath;
    }
  }

  policy.roles = await readPolicyCollection(path.join(storeDir, "roles"), ".yaml", parseRoleProfile, policy.roles);
  policy.artifactTypes = await readPolicyCollection(path.join(storeDir, "artifact-types"), ".yaml", parseArtifactTypeDefinition, policy.artifactTypes);
  policy.aliases = buildAliases(policy);

  const workflowFiles = await listFiles(path.join(storeDir, "workflows"), ".yaml");
  if (workflowFiles.length > 0) {
    const workflow = parseWorkflow(parseYamlObject(await readFile(workflowFiles[0]!, "utf8")), policy.workflow);
    policy.workflow = workflow;
  }

  return policy;
}

export async function explainRole(options: ExplainRoleOptions): Promise<RoleExplanation> {
  const policy = await loadPolicy(options.rootDir);
  const role = canonicalRole(policy, options.role);
  const profile = findRole(policy, role);
  if (!profile) {
    throw new Error(`Unknown role "${options.role}". Expected one of: ${policy.roles.map((item) => item.role).join(", ")}`);
  }
  const stage = policy.workflow.stages.find((item) => item.owner === role);
  const taskId = options.taskId;
  const suggestedCommands = taskId
    ? [
      `acs package --role ${role} --task ${taskId}`,
      ...profile.canCreate.filter((type) => type !== "handoff-package").map((type) => `acs ${role} new ${type} --task ${taskId}`),
      `acs validate --role ${role} --task ${taskId}`,
      ...profile.handoffTargets.map((target) => `acs handoff create --from ${role} --to ${target} --task ${taskId}`)
    ]
    : [
      `acs ${role} new <artifact-type> --task <TASK_ID>`,
      `acs package --role ${role} --task <TASK_ID>`
    ];
  return {
    role,
    displayName: profile.displayName,
    canCreate: profile.canCreate,
    canRead: profile.canRead,
    canUpdate: profile.canUpdate,
    handoffTargets: profile.handoffTargets,
    packageInclude: profile.packageInclude,
    taskId,
    requiredInputs: stage?.inputs,
    suggestedCommands
  };
}

export async function getNextActions(options: NextActionsOptions): Promise<NextActionsResult> {
  const policy = await loadPolicy(options.rootDir);
  const role = canonicalRole(policy, options.role);
  const stage = policy.workflow.stages.find((item) => item.owner === role);
  if (!stage) {
    throw new Error(`No workflow stage found for role "${options.role}"`);
  }
  const mode: AcsMode = options.mode ?? "strict";
  const { projectDir, storeDir } = resolveStoreContext(options.rootDir);
  const artifacts = await findArtifactsForTask(storeDir, projectDir, options.taskId);
  const foundTypes = new Set(artifacts.map((artifact) => canonicalArtifactType(policy, artifact.type)));
  const requiredInputs = stage.inputs.map((type) => ({ type, found: foundTypes.has(type) }));
  const profile = findRole(policy, role);
  const hints: AcsHint[] = [];
  const missingInputs = requiredInputs.filter((item) => !item.found).map((item) => item.type);
  const isEntry = artifacts.length === 0;

  if (isEntry && mode === "relaxed") {
    hints.push({
      for: "ai",
      message: `No artifacts exist for task "${options.taskId}". You are the entry role. First create the synthetic entry handoff: acs handoff create --from system --to ${role} --task ${options.taskId} --mode relaxed`
    });
  }
  if (missingInputs.length > 0 && mode === "strict") {
    hints.push({
      for: "ai",
      message: `Upstream artifacts missing for "${role}" (${missingInputs.join(", ")}). If this is a fresh start, re-run with --mode relaxed.`
    });
  }

  return {
    role,
    taskId: options.taskId,
    currentStage: stage.name,
    requiredInputs,
    suggestedOutputs: stage.outputs,
    suggestedCommands: [
      `acs package --role ${role} --task ${options.taskId}`,
      ...stage.outputs.map((type) => `acs ${role} new ${type} --task ${options.taskId}`),
      ...(profile?.handoffTargets ?? []).map((target) => `acs handoff create --from ${role} --to ${target} --task ${options.taskId}`)
    ],
    mode,
    ...(hints.length > 0 ? { hints } : {})
  };
}

export async function createArtifact(options: CreateArtifactOptions): Promise<AcsResult & { artifactPath: string; artifactId: string }> {
  const { projectDir, storeDir } = resolveStoreContext(options.rootDir);
  const policy = await loadPolicy(options.rootDir);
  const canonicalType = canonicalArtifactType(policy, options.type);
  const definition = findArtifactDefinition(policy, canonicalType);
  if (!definition) {
    throw new Error(`Unknown artifact type "${options.type}". Expected one of: ${policy.artifactTypes.map((artifact) => artifact.type).join(", ")}`);
  }
  const role = options.role ? canonicalRole(policy, options.role) : undefined;
  if (role && !definition.allowedCreate.includes(role)) {
    throw new Error(roleCreateError(role, canonicalType, definition.allowedCreate));
  }

  const artifactId = `${definition.idPrefix}-${options.taskId}`;
  const title = options.title ?? `${artifactId} ${definition.displayName}`;
  const storeRelPath = renderPolicyPath(definition.pathTemplate ?? policy.naming.artifactPath, {
    type: canonicalType,
    task_id: options.taskId,
    artifact_id: artifactId,
    role: role ?? definition.owner,
    ext: "md"
  });
  assertSafeStoreRelPath(storeRelPath, "artifact path");
  const targetPath = path.join(storeDir, storeRelPath);

  if (existsSync(targetPath)) {
    throw new Error(`Artifact already exists: ${storeRelPath}`);
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  const template = await readContextTemplate(storeDir, path.basename(definition.template, ".md"));
  const content = renderTemplate(template, {
    ARTIFACT_ID: artifactId,
    TYPE: canonicalType,
    TITLE: title,
    OWNER: definition.owner,
    TASK_ID: options.taskId,
    DATE: today()
  });
  await writeFile(targetPath, content, "utf8");
  await appendAudit(storeDir, {
    action: "artifact.create",
    role: role ?? definition.owner,
    task_id: options.taskId,
    artifact: storeRelPath
  });

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

  await collectPolicyPackErrors(storeDir, projectDir, errors);

  let policy: AcsPolicy;
  try {
    policy = await loadPolicy(rootDirInput);
  } catch (error) {
    errors.push(`Policy could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
    policy = cloneDefaultPolicy();
  }

  const artifactPaths = await listFiles(path.join(storeDir, "artifacts"), ".md");
  const artifacts: ArtifactRecord[] = [];
  for (const absolutePath of artifactPaths) {
    const storeRelPath = toPosix(path.relative(storeDir, absolutePath));
    const resultPath = toResultPath(storeDir, projectDir, toPosix(path.relative(storeDir, absolutePath)));
    const content = await readFile(absolutePath, "utf8");
    const metadata = parseFrontmatter(content);
    collectSchemaErrors(artifactValidator, metadata, resultPath, errors);
    const artifactType = String(metadata["type"] ?? "unknown");
    const canonicalType = canonicalArtifactType(policy, artifactType);
    if (!findArtifactDefinition(policy, canonicalType)) {
      errors.push(`${resultPath}: unknown artifact type "${artifactType}"`);
    }
    if (metadata["approval_status"] === "approved" && metadata["status"] !== "approved") {
      warnings.push(`${resultPath}: approval_status is approved but status is ${String(metadata["status"] ?? "missing")}`);
    }
    artifacts.push({
      id: String(metadata["id"] ?? path.basename(absolutePath, ".md")),
      type: canonicalType,
      title: String(metadata["title"] ?? ""),
      version: String(metadata["version"] ?? ""),
      status: String(metadata["status"] ?? ""),
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

export async function validatePolicyScope(options: ValidateScopeOptions): Promise<ValidationResult> {
  const result = await validateContextStore(options.rootDir);
  const mode: AcsMode = options.mode ?? "strict";
  const hints: AcsHint[] = [];
  const { projectDir, storeDir } = resolveStoreContext(options.rootDir);
  const policy = await loadPolicy(options.rootDir);
  const role = options.role ? canonicalRole(policy, options.role) : undefined;

  if (role && !findRole(policy, role)) {
    result.errors.push(unknownRoleError(options.role!, policy));
  }

  if (options.taskId) {
    const taskArtifacts = result.artifacts.filter((artifact) => artifact.id.includes(options.taskId!) || artifact.path.includes(options.taskId!));
    if (taskArtifacts.length === 0) {
      const noArtifactsMsg = `No artifacts found for task "${options.taskId}"`;
      if (mode === "relaxed") {
        result.warnings.push(noArtifactsMsg);
        hints.push({
          for: "ai",
          message: `Task "${options.taskId}" has no artifacts yet. As entry role "${role ?? "<role>"}", create the first artifact: acs ${role ?? "<role>"} new <type> --task ${options.taskId}`
        });
      } else {
        result.errors.push(noArtifactsMsg);
      }
    }

    if (role) {
      const stage = policy.workflow.stages.find((item) => item.owner === role);
      if (stage) {
        const foundTypes = new Set(taskArtifacts.map((artifact) => canonicalArtifactType(policy, artifact.type)));
        const missing: string[] = [];
        for (const requiredType of stage.inputs) {
          if (!foundTypes.has(requiredType)) {
            missing.push(requiredType);
          }
        }
        if (missing.length > 0) {
          if (mode === "relaxed") {
            for (const type of missing) {
              result.warnings.push(`Upstream input not present for role "${role}" on task "${options.taskId}": ${type} (allowed in relaxed mode)`);
            }
            hints.push({
              for: "ai",
              message: `Starting at role "${role}" without upstream artifacts (${missing.join(", ")}) is allowed in relaxed mode. Run 'acs role explain ${role} --task ${options.taskId}' for the standalone checklist, then create the synthetic entry handoff with: acs handoff create --from system --to ${role} --task ${options.taskId} --mode relaxed`
            });
          } else {
            for (const type of missing) {
              result.errors.push(`Missing required input for role "${role}" on task "${options.taskId}": ${type}`);
            }
            hints.push({
              for: "ai",
              message: `If "${role}" is the entry role for this task, re-run with --mode relaxed (e.g. 'acs validate --role ${role} --task ${options.taskId} --mode relaxed').`
            });
          }
        }
      }
    }
  }

  if (options.artifactPath) {
    const absolutePath = resolveArtifactPath(storeDir, projectDir, options.artifactPath);
    if (!absolutePath || !existsSync(absolutePath)) {
      result.errors.push(`Artifact not found: ${options.artifactPath}`);
    } else {
      const resultPath = toResultPath(storeDir, projectDir, toPosix(path.relative(storeDir, absolutePath)));
      const artifact = result.artifacts.find((item) => item.path === resultPath);
      if (!artifact) {
        result.errors.push(`Artifact is outside the indexed artifact set: ${options.artifactPath}`);
      }
    }
  }

  return {
    ...result,
    valid: result.errors.length === 0,
    mode,
    ...(hints.length > 0 ? { hints } : {})
  };
}

export async function createHandoff(options: CreateHandoffOptions): Promise<AcsResult & { handoffPath: string; handoffId: string }> {
  const { projectDir, storeDir } = resolveStoreContext(options.rootDir);
  const policy = await loadPolicy(options.rootDir);
  const fromRole = canonicalRole(policy, options.fromRole);
  const toRole = canonicalRole(policy, options.toRole);
  const handoffId = `HOFF-${options.taskId}-${fromRole.toUpperCase()}-${toRole.toUpperCase()}`;
  const storeRelPath = renderPolicyPath(policy.naming.handoffPath, {
    task_id: options.taskId,
    handoff_id: handoffId,
    from_role: fromRole,
    to_role: toRole
  });
  assertSafeStoreRelPath(storeRelPath, "handoff path");
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
    fromRole: fromRole.toUpperCase(),
    toRole: toRole.toUpperCase(),
    artifacts
  });
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, yaml, "utf8");
  await appendAudit(storeDir, {
    action: "handoff.create",
    from: fromRole,
    to: toRole,
    task_id: options.taskId,
    handoff: storeRelPath,
    mode: options.mode ?? "strict"
  });

  const resultPath = toResultPath(storeDir, projectDir, storeRelPath);
  return { ...emptyResult(), handoffPath: resultPath, handoffId, created: [resultPath] };
}

export async function checkHandoff(rootDirInput: string, handoffRef: string): Promise<ValidationResult>;
export async function checkHandoff(options: CheckHandoffOptions): Promise<ValidationResult>;
export async function checkHandoff(rootDirInputOrOptions: string | CheckHandoffOptions, handoffRef?: string): Promise<ValidationResult> {
  if (typeof rootDirInputOrOptions !== "string") {
    return checkHandoffPolicy(rootDirInputOrOptions);
  }
  const rootDirInput = rootDirInputOrOptions;
  const { projectDir, storeDir } = resolveStoreContext(rootDirInput);
  const handoffPath = resolveHandoffPath(storeDir, projectDir, handoffRef ?? "");
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

export async function listHandoffs(options: ListHandoffsOptions): Promise<string[]> {
  const { projectDir, storeDir } = resolveStoreContext(options.rootDir);
  const role = options.role?.toLowerCase();
  return (await listFiles(path.join(storeDir, "handoffs"), ".yaml"))
    .filter((file) => !options.taskId || file.includes(options.taskId))
    .filter((file) => !role || handoffMatchesRole(file, role))
    .map((file) => toResultPath(storeDir, projectDir, toPosix(path.relative(storeDir, file))));
}

export async function buildContextPackage(options: BuildContextPackageOptions): Promise<AcsResult & { packagePath: string }> {
  const { projectDir, storeDir } = resolveStoreContext(options.rootDir);
  const policy = await loadPolicy(options.rootDir);
  const format = options.format ?? "markdown";
  const allArtifacts = await findArtifactsForTask(storeDir, projectDir, options.taskId);
  const role = canonicalRole(policy, options.role);
  const roleProfile = findRole(policy, role);
  if (!roleProfile) {
    throw new Error(unknownRoleError(options.role, policy));
  }
  const allowedTypes = roleProfile.packageInclude.length > 0 ? roleProfile.packageInclude : roleProfile.canRead;
  const artifacts = allArtifacts.filter((artifact) => {
    const typeAllowed = allowedTypes.includes(canonicalArtifactType(policy, artifact.type));
    const usableState = artifact.approvalStatus === "approved" || artifact.approvalStatus === "pending";
    return typeAllowed && usableState;
  });
  const excludedArtifacts = allArtifacts
    .filter((artifact) => !artifacts.includes(artifact))
    .map((artifact) => ({
      path: artifact.path,
      reason: !allowedTypes.includes(canonicalArtifactType(policy, artifact.type))
        ? `not required for ${options.role} role`
        : `approval_status ${artifact.approvalStatus || "missing"} is not usable`
    }));

  const handoffs = (await listFiles(path.join(storeDir, "handoffs"), ".yaml"))
    .filter((file) => path.basename(file).includes(options.taskId))
    .filter((file) => handoffMatchesRole(file, role))
    .map((file) => toResultPath(storeDir, projectDir, toPosix(path.relative(storeDir, file))));

  const packageStoreRel = renderPolicyPath(policy.naming.packagePath, {
    task_id: options.taskId,
    role,
    ext: format === "json" ? "json" : "md"
  });
  assertSafeStoreRelPath(packageStoreRel, "package path");
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

  await appendAudit(storeDir, {
    action: "package.build",
    role,
    task_id: options.taskId,
    artifact: packageStoreRel
  });
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
  await appendAudit(storeDir, { action: "index.rebuild" });
  const resultPath = toResultPath(storeDir, projectDir, "index.json");
  return { ...emptyResult(), updated: [resultPath], artifactCount: validation.artifacts.length, handoffCount: validation.handoffs.length };
}

export async function doctor(rootDirInput: string): Promise<ValidationResult> {
  return validateContextStore(rootDirInput);
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function defineArtifact(
  type: string,
  displayName: string,
  template: string,
  idPrefix: string,
  owner: string,
  allowedCreate: string[],
  allowedUpdate: string[],
  allowedRead: string[],
  requiredFields: string[],
  aliases: string[] = []
): ArtifactTypeDefinition {
  return {
    type,
    displayName,
    template,
    idPrefix,
    owner,
    aliases,
    allowedCreate,
    allowedUpdate,
    allowedRead,
    requiredFields
  };
}

function cloneDefaultPolicy(): AcsPolicy {
  return JSON.parse(JSON.stringify(defaultPolicy)) as AcsPolicy;
}

function buildAliases(policy: AcsPolicy): Record<string, string> {
  const aliases: Record<string, string> = { ...defaultPolicy.aliases, ...policy.aliases };
  for (const artifactType of policy.artifactTypes) {
    for (const alias of artifactType.aliases) {
      aliases[alias] = artifactType.type;
    }
  }
  return aliases;
}

function canonicalArtifactType(policy: AcsPolicy, type: string): string {
  return policy.aliases[type] ?? type;
}

function canonicalRole(policy: AcsPolicy, role: string): string {
  return policy.aliases[role.toLowerCase()] ?? role.toLowerCase();
}

function findArtifactDefinition(policy: AcsPolicy, type: string): ArtifactTypeDefinition | undefined {
  const canonicalType = canonicalArtifactType(policy, type);
  return policy.artifactTypes.find((artifactType) => artifactType.type === canonicalType);
}

function findRole(policy: AcsPolicy, role: string): RoleProfile | undefined {
  const canonical = canonicalRole(policy, role);
  return policy.roles.find((profile) => profile.role === canonical);
}

function roleCreateError(role: string, type: string, allowedRoles: string[]): string {
  return [
    `role "${role}" is not allowed to create artifact type "${type}".`,
    "",
    "Allowed roles:",
    ...allowedRoles.map((allowedRole) => `- ${allowedRole}`),
    "",
    "Suggestion:",
    `- Use: acs ${allowedRoles[0] ?? "<role>"} new ${type} --task <TASK_ID>`,
    `- Or update artifact-types/${type}.yaml if your workflow allows ${role} to create ${type}.`
  ].join("\n");
}

function unknownRoleError(role: string, policy: AcsPolicy): string {
  return `Unknown role "${role}". Expected one of: ${policy.roles.map((item) => item.role).join(", ")}`;
}

async function checkHandoffPolicy(options: CheckHandoffOptions): Promise<ValidationResult> {
  const { projectDir, storeDir } = resolveStoreContext(options.rootDir);
  const policy = await loadPolicy(options.rootDir);
  const fromRole = canonicalRole(policy, options.fromRole);
  const toRole = canonicalRole(policy, options.toRole);
  const mode: AcsMode = options.mode ?? "strict";
  const errors: string[] = [];
  const warnings: string[] = [];
  const hints: AcsHint[] = [];
  const rule = policy.workflow.handoffRules.find((item) => item.from === fromRole && item.to === toRole);
  if (!rule) {
    const validFrom = policy.workflow.handoffRules
      .filter((item) => item.from === fromRole)
      .map((item) => `${item.from}->${item.to}`);
    const lines = [
      `No handoff rule configured for ${fromRole} -> ${toRole}.`,
      validFrom.length > 0 ? `Valid transitions from ${fromRole}: ${validFrom.join(", ")}` : `No transitions configured from ${fromRole}.`,
      `To start a fresh task at ${toRole}, use: acs handoff create --from system --to ${toRole} --task ${options.taskId} --mode relaxed`
    ];
    errors.push(lines.join("\n"));
    hints.push({
      for: "ai",
      message: `If "${toRole}" is the entry role, create a synthetic entry handoff: acs handoff create --from system --to ${toRole} --task ${options.taskId} --mode relaxed`
    });
    return { valid: false, errors, warnings, artifacts: [], handoffs: [], mode, hints };
  }

  const artifacts = await findArtifactsForTask(storeDir, projectDir, options.taskId);
  const artifactsByType = new Map(artifacts.map((artifact) => [canonicalArtifactType(policy, artifact.type), artifact]));
  for (const type of rule.requiredArtifacts) {
    const artifact = artifactsByType.get(type);
    if (!artifact) {
      errors.push(`Missing required artifact for ${fromRole} -> ${toRole}: ${type}`);
      continue;
    }
    if (!artifactSatisfiesRequiredState(artifact, rule.requiredState)) {
      errors.push(`${artifact.path}: status or approval_status must be ${rule.requiredState} for ${fromRole} -> ${toRole}`);
    }
  }

  if (fromRole === "system" && mode === "relaxed") {
    warnings.push(`Synthetic entry handoff: ${fromRole} -> ${toRole} (relaxed mode).`);
    hints.push({
      for: "ai",
      message: `Entry handoff accepted. Now create the first artifact: acs ${toRole} new <type> --task ${options.taskId}`
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    artifacts,
    handoffs: await listHandoffs({ rootDir: options.rootDir, taskId: options.taskId }),
    mode,
    ...(hints.length > 0 ? { hints } : {})
  };
}

function renderPolicyPath(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((content, [key, value]) => content.replaceAll(`{${key}}`, value), template);
}

function assertSafeStoreRelPath(relPath: string, label: string): void {
  const normalized = path.normalize(relPath);
  if (path.isAbsolute(relPath) || normalized.startsWith("..") || normalized.includes(`..${path.sep}`)) {
    throw new Error(`Invalid ${label}: ${relPath}`);
  }
}

function artifactSatisfiesRequiredState(artifact: ArtifactRecord, requiredState: string): boolean {
  if (requiredState === "any") {
    return true;
  }
  return artifact.status === requiredState || artifact.approvalStatus === requiredState;
}

async function readPolicyCollection<T>(
  rootDir: string,
  extension: string,
  parse: (value: Record<string, unknown>) => T | null,
  fallback: T[]
): Promise<T[]> {
  if (!existsSync(rootDir)) {
    return fallback;
  }
  const files = await listFiles(rootDir, extension);
  if (files.length === 0) {
    return fallback;
  }
  const values: T[] = [];
  for (const file of files) {
    const parsed = parse(parseYamlObject(await readFile(file, "utf8")));
    if (parsed) {
      values.push(parsed);
    }
  }
  return values.length > 0 ? values : fallback;
}

function parseRoleProfile(value: Record<string, unknown>): RoleProfile | null {
  const role = stringValue(value["role"]);
  if (!role) {
    return null;
  }
  return {
    role,
    displayName: stringValue(value["display_name"]) ?? role,
    canCreate: stringArray(value["can_create"]),
    canRead: stringArray(value["can_read"]),
    canUpdate: stringArray(value["can_update"]),
    defaultTemplates: stringMap(value["default_templates"]),
    handoffTargets: stringArray(value["handoff_targets"]),
    packageInclude: stringArray(isRecord(value["package_policy"]) ? value["package_policy"]["include"] : undefined),
    packageExclude: stringArray(isRecord(value["package_policy"]) ? value["package_policy"]["exclude"] : undefined)
  };
}

function parseArtifactTypeDefinition(value: Record<string, unknown>): ArtifactTypeDefinition | null {
  const type = stringValue(value["type"]);
  if (!type) {
    return null;
  }
  const allowedRoles = isRecord(value["allowed_roles"]) ? value["allowed_roles"] : {};
  return {
    type,
    displayName: stringValue(value["display_name"]) ?? type,
    template: stringValue(value["template"]) ?? `${type}.md`,
    idPrefix: stringValue(value["id_prefix"]) ?? type.toUpperCase(),
    owner: stringValue(value["default_owner"]) ?? "system",
    pathTemplate: stringValue(value["path_template"]),
    schema: stringValue(value["schema"]),
    aliases: stringArray(value["aliases"]),
    allowedCreate: stringArray(allowedRoles["create"]),
    allowedUpdate: stringArray(allowedRoles["update"]),
    allowedRead: stringArray(allowedRoles["read"]),
    requiredFields: stringArray(value["required_fields"])
  };
}

function parseWorkflow(value: Record<string, unknown>, fallback: AcsPolicy["workflow"]): AcsPolicy["workflow"] {
  const stages = Array.isArray(value["stages"])
    ? value["stages"].filter(isRecord).map((stage) => ({
      id: stringValue(stage["id"]) ?? "",
      name: stringValue(stage["name"]) ?? stringValue(stage["id"]) ?? "",
      owner: stringValue(stage["owner"]) ?? "",
      inputs: stringArray(stage["inputs"]),
      outputs: stringArray(stage["outputs"]),
      next: stringArray(stage["next"])
    })).filter((stage) => stage.id && stage.owner)
    : fallback.stages;
  const handoffRules = Array.isArray(value["handoff_rules"])
    ? value["handoff_rules"].filter(isRecord).map((rule) => ({
      from: stringValue(rule["from"]) ?? "",
      to: stringValue(rule["to"]) ?? "",
      requiredArtifacts: stringArray(rule["required_artifacts"]),
      requiredState: stringValue(rule["required_state"]) ?? "approved"
    })).filter((rule) => rule.from && rule.to)
    : fallback.handoffRules;
  return { stages, handoffRules };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function stringifyAcsConfig(policy: AcsPolicy, mode: StoreMode, projectDir: string): string {
  return [
    "version: 0.1.0",
    "project:",
    "  default_workflow: default-sdlc",
    "store:",
    `  mode: ${mode}`,
    mode === "local" ? `  project_path: ${projectDir.replaceAll("\\", "/")}` : undefined,
    "roles:",
    ...policy.roles.map((role) => `  - ${role.role}`),
    "artifact_types:",
    ...policy.artifactTypes.map((artifact) => `  - ${artifact.type}`),
    "defaults:",
    "  language: en",
    "  format: markdown",
    "  approval_required: true",
    "naming:",
    `  artifact_path: "${policy.naming.artifactPath}"`,
    `  handoff_path: "${policy.naming.handoffPath}"`,
    `  package_path: "${policy.naming.packagePath}"`,
    ""
  ].filter((line): line is string => typeof line === "string").join("\n");
}

function stringifyRole(role: RoleProfile): string {
  return [
    `role: ${role.role}`,
    `display_name: ${role.displayName}`,
    ...yamlArrayLines("can_create", role.canCreate, ""),
    ...yamlArrayLines("can_read", role.canRead, ""),
    ...yamlArrayLines("can_update", role.canUpdate, ""),
    ...(Object.keys(role.defaultTemplates).length > 0
      ? ["default_templates:", ...Object.entries(role.defaultTemplates).map(([key, value]) => `  ${key}: ${value}`)]
      : ["default_templates: {}"]),
    ...yamlArrayLines("handoff_targets", role.handoffTargets, ""),
    "package_policy:",
    ...yamlArrayLines("include", role.packageInclude, "  "),
    ...yamlArrayLines("exclude", role.packageExclude, "  "),
    ""
  ].join("\n");
}

function stringifyArtifactType(artifact: ArtifactTypeDefinition): string {
  return [
    `type: ${artifact.type}`,
    `display_name: ${artifact.displayName}`,
    `template: ${artifact.template}`,
    `id_prefix: ${artifact.idPrefix}`,
    `default_owner: ${artifact.owner}`,
    artifact.pathTemplate ? `path_template: "${artifact.pathTemplate}"` : undefined,
    artifact.schema ? `schema: ${artifact.schema}` : undefined,
    ...yamlArrayLines("aliases", artifact.aliases, ""),
    ...yamlArrayLines("required_fields", artifact.requiredFields, ""),
    "allowed_roles:",
    ...yamlArrayLines("create", artifact.allowedCreate, "  "),
    ...yamlArrayLines("update", artifact.allowedUpdate, "  "),
    ...yamlArrayLines("read", artifact.allowedRead, "  "),
    ""
  ].filter((line): line is string => typeof line === "string").join("\n");
}

function yamlArrayLines(key: string, values: string[], indent: string): string[] {
  if (values.length === 0) {
    return [`${indent}${key}: []`];
  }
  return [`${indent}${key}:`, ...values.map((item) => `${indent}  - ${item}`)];
}

function stringifyWorkflow(policy: AcsPolicy): string {
  return [
    "workflow: default-sdlc",
    "display_name: Default SDLC Workflow",
    "stages:",
    ...policy.workflow.stages.flatMap((stage) => [
      `  - id: ${stage.id}`,
      `    name: ${stage.name}`,
      `    owner: ${stage.owner}`,
      "    inputs:",
      ...(stage.inputs.length > 0 ? stage.inputs.map((item) => `      - ${item}`) : ["      []"]),
      "    outputs:",
      ...stage.outputs.map((item) => `      - ${item}`),
      "    next:",
      ...(stage.next.length > 0 ? stage.next.map((item) => `      - ${item}`) : ["      []"])
    ]),
    "handoff_rules:",
    ...policy.workflow.handoffRules.flatMap((rule) => [
      `  - from: ${rule.from}`,
      `    to: ${rule.to}`,
      ...(rule.requiredArtifacts.length > 0
        ? ["    required_artifacts:", ...rule.requiredArtifacts.map((item) => `      - ${item}`)]
        : ["    required_artifacts: []"]),
      `    required_state: ${rule.requiredState}`
    ]),
    ""
  ].join("\n");
}

function defaultSchemaText(fileName: string): string | null {
  if (fileName === "artifact.schema.json") {
    return JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://agent-context-store.dev/schemas/artifact.schema.json",
      title: "Agent Context Store Artifact Metadata",
      type: "object",
      required: ["id", "type", "title", "owner", "status", "version", "approval_status", "last_updated", "source_refs"],
      properties: {
        id: { type: "string" },
        type: { type: "string" },
        title: { type: "string" },
        owner: { type: "string" },
        status: { type: "string", enum: ["draft", "ready_for_review", "changes_requested", "approved", "deprecated", "superseded"] },
        version: { type: "string" },
        approval_status: { type: "string", enum: ["pending", "approved", "changes_requested", "deprecated", "superseded"] },
        last_updated: { type: "string", format: "date" },
        source_refs: { type: "array", items: { type: "string" } },
        depends_on: { type: "array", items: { type: "string" } },
        outputs: { type: "array", items: { type: "string" } }
      },
      additionalProperties: true
    }, null, 2);
  }
  if (fileName === "acs.schema.json") {
    return JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://agent-context-store.dev/schemas/acs.schema.json",
      title: "Agent Context Store Workflow Config",
      type: "object",
      required: ["version", "project", "store", "roles", "artifact_types", "naming"],
      properties: {
        version: { type: "string" },
        project: { type: "object", required: ["default_workflow"], properties: { default_workflow: { type: "string" } }, additionalProperties: true },
        store: { type: "object", required: ["mode"], properties: { mode: { enum: ["in-repo", "local", "dedicated"] }, project_path: { type: "string" } }, additionalProperties: true },
        roles: { type: "array", items: { type: "string" }, minItems: 1 },
        artifact_types: { type: "array", items: { type: "string" }, minItems: 1 },
        defaults: { type: "object", additionalProperties: true },
        naming: {
          type: "object",
          required: ["artifact_path", "handoff_path", "package_path"],
          properties: {
            artifact_path: { type: "string" },
            handoff_path: { type: "string" },
            package_path: { type: "string" }
          },
          additionalProperties: false
        }
      },
      additionalProperties: true
    }, null, 2);
  }
  if (fileName === "role.schema.json") {
    return JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://agent-context-store.dev/schemas/role.schema.json",
      title: "Agent Context Store Role Profile",
      type: "object",
      required: ["role", "display_name", "can_create", "can_read", "can_update", "handoff_targets", "package_policy"],
      properties: {
        role: { type: "string" },
        display_name: { type: "string" },
        can_create: { type: "array", items: { type: "string" } },
        can_read: { type: "array", items: { type: "string" } },
        can_update: { type: "array", items: { type: "string" } },
        default_templates: { type: "object", additionalProperties: { type: "string" } },
        handoff_targets: { type: "array", items: { type: "string" } },
        package_policy: {
          type: "object",
          required: ["include", "exclude"],
          properties: {
            include: { type: "array", items: { type: "string" } },
            exclude: { type: "array", items: { type: "string" } }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    }, null, 2);
  }
  if (fileName === "artifact-type.schema.json") {
    return JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://agent-context-store.dev/schemas/artifact-type.schema.json",
      title: "Agent Context Store Artifact Type Definition",
      type: "object",
      required: ["type", "display_name", "template", "id_prefix", "default_owner", "required_fields", "allowed_roles"],
      properties: {
        type: { type: "string" },
        display_name: { type: "string" },
        template: { type: "string" },
        id_prefix: { type: "string" },
        default_owner: { type: "string" },
        path_template: { type: "string" },
        schema: { type: "string" },
        aliases: { type: "array", items: { type: "string" } },
        required_fields: { type: "array", items: { type: "string" } },
        allowed_roles: {
          type: "object",
          required: ["create", "update", "read"],
          properties: {
            create: { type: "array", items: { type: "string" } },
            update: { type: "array", items: { type: "string" } },
            read: { type: "array", items: { type: "string" } }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    }, null, 2);
  }
  if (fileName === "workflow.schema.json") {
    return JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://agent-context-store.dev/schemas/workflow.schema.json",
      title: "Agent Context Store Workflow Definition",
      type: "object",
      required: ["workflow", "display_name", "stages", "handoff_rules"],
      properties: {
        workflow: { type: "string" },
        display_name: { type: "string" },
        stages: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["id", "name", "owner", "inputs", "outputs", "next"],
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              owner: { type: "string" },
              inputs: { type: "array", items: { type: "string" } },
              outputs: { type: "array", items: { type: "string" } },
              next: { type: "array", items: { type: "string" } }
            },
            additionalProperties: false
          }
        },
        handoff_rules: {
          type: "array",
          items: {
            type: "object",
            required: ["from", "to", "required_artifacts", "required_state"],
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              required_artifacts: { type: "array", items: { type: "string" } },
              required_state: { type: "string" }
            },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    }, null, 2);
  }
  return JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", additionalProperties: true }, null, 2);
}

function defaultTemplateText(fileName: string): string | null {
  const type = path.basename(fileName, ".md");
  const artifact = defaultPolicy.artifactTypes.find((item) => item.template === fileName || item.type === type);
  if (!artifact) {
    return null;
  }
  return [
    "---",
    "id: {{ARTIFACT_ID}}",
    "type: {{TYPE}}",
    "task_id: {{TASK_ID}}",
    "title: \"{{TITLE}}\"",
    "owner: {{OWNER}}",
    "status: draft",
    "version: v0.1",
    "approval_status: pending",
    "last_updated: {{DATE}}",
    "source_refs: []",
    "depends_on: []",
    "outputs: []",
    "---",
    "",
    "# {{TITLE}}",
    "",
    `## ${artifact.displayName}`,
    "",
    "Describe the artifact content here.",
    "",
    "## Source References",
    "",
    "- None yet.",
    ""
  ].join("\n");
}

async function readAssetText(assetDir: "schemas" | "templates", fileName: string): Promise<string> {
  const rootDir = findToolkitRoot();
  return readFile(path.join(rootDir, "src", "assets", assetDir, fileName), "utf8");
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
    : defaultSchemaText(schemaFileName) ?? await readAssetText("schemas", schemaFileName);
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

async function collectPolicyPackErrors(storeDir: string, projectDir: string, errors: string[]): Promise<void> {
  const checks: Array<{ relDir: string; fileNames: string[]; schemaFileName: string }> = [
    { relDir: "roles", fileNames: roleFileNames, schemaFileName: "role.schema.json" },
    { relDir: "artifact-types", fileNames: artifactTypeFileNames, schemaFileName: "artifact-type.schema.json" },
    { relDir: "workflows", fileNames: workflowFileNames, schemaFileName: "workflow.schema.json" }
  ];

  if (existsSync(path.join(storeDir, "acs.yaml"))) {
    await validateYamlPolicyFile(storeDir, projectDir, "acs.yaml", await loadSchemaValidator(storeDir, "acs.schema.json"), errors);
  } else {
    errors.push("Missing policy file: acs.yaml");
  }

  for (const check of checks) {
    const validator = await loadSchemaValidator(storeDir, check.schemaFileName);
    for (const fileName of check.fileNames) {
      const relPath = `${check.relDir}/${fileName}`;
      if (!existsSync(path.join(storeDir, relPath))) {
        errors.push(`Missing policy file: ${relPath}`);
        continue;
      }
      await validateYamlPolicyFile(storeDir, projectDir, relPath, validator, errors);
    }
  }
}

async function validateYamlPolicyFile(
  storeDir: string,
  projectDir: string,
  relPath: string,
  validator: ValidateFunction,
  errors: string[]
): Promise<void> {
  const absolutePath = path.join(storeDir, relPath);
  const label = toResultPath(storeDir, projectDir, relPath);
  try {
    const value = parseYamlObject(await readFile(absolutePath, "utf8"));
    collectSchemaErrors(validator, value, label, errors);
  } catch (error) {
    errors.push(`${label}: invalid policy YAML: ${error instanceof Error ? error.message : String(error)}`);
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

  // Synthetic entry handoffs (from_role: "system") legitimately have no
  // upstream artifacts — they exist purely to record the workflow entry point
  // when a non-BA role starts a fresh task in relaxed mode.
  const fromRoleValue = handoff["from_role"];
  const isSyntheticEntry = typeof fromRoleValue === "string" && fromRoleValue.toLowerCase() === "system";
  if (requiredArtifacts.length === 0 && !isSyntheticEntry) {
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
      status: String(metadata["status"] ?? ""),
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
  if (existsSync(inHandoffs)) {
    return inHandoffs;
  }
  const matches = listFilesSync(path.join(storeDir, "handoffs"), ".yaml")
    .filter((file) => path.basename(file) === normalizedRef);
  return matches[0] ?? null;
}

function resolveArtifactPath(storeDir: string, projectDir: string, artifactRef: string): string | null {
  const direct = path.resolve(storeDir, artifactRef);
  if (existsSync(direct)) {
    return direct;
  }
  const projectRelative = path.resolve(projectDir, artifactRef);
  if (existsSync(projectRelative)) {
    return projectRelative;
  }
  const inArtifacts = path.join(storeDir, "artifacts", artifactRef);
  if (existsSync(inArtifacts)) {
    return inArtifacts;
  }
  return null;
}

function listFilesSync(rootDir: string, extension: string): string[] {
  if (!existsSync(rootDir)) {
    return [];
  }
  const entries = readdirSyncSafe(rootDir);
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesSync(absolutePath, extension));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(absolutePath);
    }
  }
  return files.sort();
}

function readdirSyncSafe(rootDir: string): Dirent[] {
  try {
    return readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
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
    if (
      existsSync(path.join(currentDir, "src", "assets", "schemas"))
      && existsSync(path.join(currentDir, "src", "assets", "templates"))
    ) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error("Could not locate agent-context-store src/assets schemas/templates");
}

/**
 * Append a structured audit event.
 *
 * Writes to two places (both via fs.appendFile, which is atomic on POSIX so
 * concurrent acs invocations cannot truncate each other):
 *   1. audit/{YYYY-MM-DD}.log    — daily JSONL rollup (replaces legacy text log)
 *   2. audit/tasks/{task_id}.jsonl — per-task working log (only if task_id set)
 *
 * session_id is auto-filled from ACS_SESSION_ID when present. ts is auto-filled
 * with the current ISO timestamp when callers omit it.
 */
async function appendAudit(storeDir: string, event: AuditLogEvent): Promise<void> {
  const auditDir = path.join(storeDir, "audit");
  await mkdir(auditDir, { recursive: true });
  const sessionId = process.env["ACS_SESSION_ID"];
  const base: AuditLogEvent = { ...event };
  if (!base.ts) base.ts = new Date().toISOString();
  if (sessionId && !base.session_id) {
    base.session_id = sessionId;
  }
  const line = JSON.stringify(base) + "\n";
  await appendFile(path.join(auditDir, `${today()}.log`), line, "utf8");
  if (typeof base.task_id === "string" && base.task_id.length > 0) {
    const tasksDir = path.join(auditDir, "tasks");
    await mkdir(tasksDir, { recursive: true });
    await appendFile(path.join(tasksDir, `${base.task_id}.jsonl`), line, "utf8");
  }
}

export async function readTaskLog(options: ReadTaskLogOptions): Promise<AuditLogEvent[]> {
  const { storeDir } = resolveStoreContext(options.rootDir);
  const filePath = path.join(storeDir, "audit", "tasks", `${options.taskId}.jsonl`);
  if (!existsSync(filePath)) {
    return [];
  }
  const content = await readFile(filePath, "utf8");
  const events: AuditLogEvent[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as AuditLogEvent;
      events.push(parsed);
    } catch {
      // skip malformed line; legacy text logs may not be JSON
    }
  }
  if (typeof options.tail === "number" && options.tail > 0 && events.length > options.tail) {
    return events.slice(events.length - options.tail);
  }
  return events;
}

export async function getTasksOverview(rootDirInput: string): Promise<TaskOverview[]> {
  const { projectDir, storeDir } = resolveStoreContext(rootDirInput);
  const policy = await loadPolicy(rootDirInput);
  // Group artifacts by their frontmatter task_id field, which is written by
  // createArtifact via the TASK_ID template variable. Falls back to the
  // legacy id-suffix heuristic only when frontmatter has no task_id.
  const taskIds = new Set<string>();
  const artifactPaths = await listFiles(path.join(storeDir, "artifacts"), ".md");
  for (const absolutePath of artifactPaths) {
    const content = await readFile(absolutePath, "utf8");
    const metadata = parseFrontmatter(content);
    const taskIdValue = metadata["task_id"];
    if (typeof taskIdValue === "string" && taskIdValue.length > 0) {
      taskIds.add(taskIdValue);
      continue;
    }
    const idValue = metadata["id"];
    if (typeof idValue === "string") {
      const dash = idValue.indexOf("-");
      if (dash > 0 && dash < idValue.length - 1) {
        taskIds.add(idValue.slice(dash + 1));
      }
    }
  }
  const stages = policy.workflow.stages;
  const result: TaskOverview[] = [];
  for (const taskId of taskIds) {
    const artifacts = await findArtifactsForTask(storeDir, projectDir, taskId);
    const owners = new Set<string>();
    for (const artifact of artifacts) {
      const def = findArtifactDefinition(policy, canonicalArtifactType(policy, artifact.type));
      if (def && def.owner !== "system") {
        owners.add(def.owner);
      }
    }
    let suggestedNextRole = stages[0]?.owner ?? "ba";
    let isEntry = false;
    if (owners.size === 0) {
      suggestedNextRole = "any";
      isEntry = true;
    } else {
      // Find the latest stage whose owner has artifacts and pick its next stage.
      let lastIdx = -1;
      stages.forEach((stage, idx) => {
        if (owners.has(stage.owner)) lastIdx = idx;
      });
      if (lastIdx >= 0 && lastIdx + 1 < stages.length) {
        suggestedNextRole = stages[lastIdx + 1]!.owner;
      } else if (lastIdx >= 0) {
        suggestedNextRole = stages[lastIdx]!.owner;
      }
    }
    result.push({
      taskId,
      rolesWithArtifacts: [...owners],
      artifactCount: artifacts.length,
      suggestedNextRole,
      isEntry
    });
  }
  return result.sort((a, b) => a.taskId.localeCompare(b.taskId));
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
