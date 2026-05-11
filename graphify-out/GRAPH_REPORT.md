# Graph Report - D:/GitLab/_TRS/ai-agent-automation/ai-dev-automation-agent/next-phase/agent-context-store  (2026-05-11)

## Corpus Check
- Corpus is ~27,827 words - fits in a single context window. You may not need a graph.

## Summary
- 221 nodes · 563 edges · 20 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 48 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_CLI Entry and Validation|CLI Entry and Validation]]
- [[_COMMUNITY_Store Concepts and Features|Store Concepts and Features]]
- [[_COMMUNITY_CLI Flag Parsing Utilities|CLI Flag Parsing Utilities]]
- [[_COMMUNITY_Test Harness Utilities|Test Harness Utilities]]
- [[_COMMUNITY_Core Artifact Operations|Core Artifact Operations]]
- [[_COMMUNITY_Context Packaging Workflow|Context Packaging Workflow]]
- [[_COMMUNITY_Workspace Build and Docs|Workspace Build and Docs]]
- [[_COMMUNITY_Local Registry Resolution|Local Registry Resolution]]
- [[_COMMUNITY_Validation and Doctor Checks|Validation and Doctor Checks]]
- [[_COMMUNITY_Policy and State Rules|Policy and State Rules]]
- [[_COMMUNITY_Bootstrap Defaults and Init|Bootstrap Defaults and Init]]
- [[_COMMUNITY_Role Skills and Templates|Role Skills and Templates]]
- [[_COMMUNITY_Artifact Type Resolution|Artifact Type Resolution]]
- [[_COMMUNITY_Path Normalization Helpers|Path Normalization Helpers]]
- [[_COMMUNITY_ADR Template|ADR Template]]
- [[_COMMUNITY_API Design Template|API Design Template]]
- [[_COMMUNITY_SDD Template|SDD Template]]
- [[_COMMUNITY_SRS Template|SRS Template]]
- [[_COMMUNITY_Test Plan Template|Test Plan Template]]
- [[_COMMUNITY_README Sync Script|README Sync Script]]

## God Nodes (most connected - your core abstractions)
1. `main()` - 31 edges
2. `validateContextStore()` - 20 edges
3. `loadPolicy()` - 20 edges
4. `resolveStoreContext()` - 18 edges
5. `initContextStore()` - 18 edges
6. `createArtifact()` - 18 edges
7. `buildContextPackage()` - 16 edges
8. `toResultPath()` - 14 edges
9. `createHandoff()` - 13 edges
10. `checkHandoff()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Full SDLC Integration Scenario` --semantically_similar_to--> `Agent Context Store Operating Model`  [INFERRED] [semantically similar]
  src/test/integration.spec.ts → README.md
- `Compiled Dist Testing Strategy` --semantically_similar_to--> `NPM Pack Smoke Test`  [INFERRED] [semantically similar]
  DEVELOPMENT.md → src/test/e2e/pack.spec.ts
- `Industry Handoff Alignment` --conceptually_related_to--> `Default Workflow Policy`  [AMBIGUOUS]
  README.md → src/packages/core/src/index.ts
- `CLI README Command Reference` --semantically_similar_to--> `Agent Context Store Operating Model`  [INFERRED] [semantically similar]
  src/packages/cli/README.md → README.md
- `Local Demo Flow` --conceptually_related_to--> `Role Handoff Workflow`  [INFERRED]
  DEVELOPMENT.md → README.md

## Hyperedges (group relationships)
- **BA SA DEV QA Handoff Chain** — acs_ba_skill_requirements_handoff, acs_sa_skill_design_handoff, acs_dev_skill_review_ready_handoff, acs_qa_skill_approval_handoff [EXTRACTED 1.00]
- **Core Store Lifecycle Pipeline** — index_init_context_store, index_create_artifact, index_validate_policy_scope, index_create_handoff, index_build_context_package, index_build_index [INFERRED 0.82]
- **Relaxed Entry Mode Mechanism** — index_relaxed_mode_entry, index_check_handoff_policy, agent_context_store_skill_entry_role_mode, relaxed_mode_spec_entry_mode_behavior [INFERRED 0.86]

## Communities

### Community 0 - "CLI Entry and Validation"
Cohesion: 0.12
Nodes (35): Agent Context Store Entry-Role Mode Guidance, Cursor AGENTS Durable Context Instruction, CLI README Command Reference, CLI Command Contract Tests, Core API Contract Tests, Compiled Dist Testing Strategy, Release Workflow, isolatedEnv Test Helper (+27 more)

### Community 1 - "Store Concepts and Features"
Cohesion: 0.1
Nodes (29): Agent Context Store Toolkit, Artifact Creation, Context Store Layout, Dedicated Store Mode, Git-Backed Schema-Validated Handoffs, Role Handoff Workflow, In-Repo Store Mode, Local Store Mode (+21 more)

### Community 2 - "CLI Flag Parsing Utilities"
Cohesion: 0.27
Nodes (23): ensureSessionId(), findAgentConfigRoot(), getAcsMode(), getStringFlag(), getUserSkillsDir(), handleHandoff(), handleNewArtifact(), handlePackage() (+15 more)

### Community 3 - "Test Harness Utilities"
Cohesion: 0.13
Nodes (7): cleanupTempDir(), exists(), initStore(), makeTempDir(), readText(), runCli(), withTempProject()

### Community 4 - "Core Artifact Operations"
Cohesion: 0.24
Nodes (17): appendAudit(), assertSafeStoreRelPath(), buildIndex(), createArtifact(), createHandoff(), emptyResult(), findToolkitRoot(), handoffMatchesRole() (+9 more)

### Community 5 - "Context Packaging Workflow"
Cohesion: 0.26
Nodes (14): buildAliases(), buildContextPackage(), canonicalRole(), cloneDefaultPolicy(), explainRole(), findArtifactsForTask(), findRole(), getNextActions() (+6 more)

### Community 6 - "Workspace Build and Docs"
Cohesion: 0.17
Nodes (13): Bundled Agent Config Packaging, Compiled Output Tests, Development Guide, Local Demo Flow, pnpm Workspace Monorepo, Project Layout, Rationale: Publish Agent Config With CLI, Rationale: Test Compiled Output (+5 more)

### Community 7 - "Local Registry Resolution"
Cohesion: 0.24
Nodes (12): getLocalBaseDir(), getLocalRegistryPath(), getProjectRegistryKey(), isRecord(), parseArtifactTypeDefinition(), parseRoleProfile(), readLocalRegistry(), readLocalStoreRegistration() (+4 more)

### Community 8 - "Validation and Doctor Checks"
Cohesion: 0.29
Nodes (12): checkHandoff(), collectHandoffStructuralErrors(), collectPolicyPackErrors(), collectSchemaErrors(), doctor(), extractArtifactPaths(), loadSchemaValidator(), parseFrontmatter() (+4 more)

### Community 9 - "Policy and State Rules"
Cohesion: 0.33
Nodes (9): artifactSatisfiesRequiredState(), checkHandoffPolicy(), getStoreInfo(), listFilesSync(), listHandoffs(), readdirSyncSafe(), readTaskLog(), resolveHandoffPath() (+1 more)

### Community 10 - "Bootstrap Defaults and Init"
Cohesion: 0.22
Nodes (10): computeProjectSlug(), defaultSchemaText(), defaultTemplateText(), initContextStore(), stringifyAcsConfig(), stringifyArtifactType(), stringifyRole(), stringifyWorkflow() (+2 more)

### Community 11 - "Role Skills and Templates"
Cohesion: 0.28
Nodes (9): BA Skill Requirements Handoff, DEV Skill Review-Ready Handoff, QA Skill Approval Handoff, SA Skill Design Handoff, ADR Decision Tradeoffs, API Contract Definition Template, SDD Traceability Checklist, SRS Testable Requirements Template (+1 more)

### Community 12 - "Artifact Type Resolution"
Cohesion: 1.0
Nodes (3): canonicalArtifactType(), findArtifactDefinition(), getTasksOverview()

### Community 13 - "Path Normalization Helpers"
Cohesion: 1.0
Nodes (2): toPosix(), toStoreRelPath()

### Community 14 - "ADR Template"
Cohesion: 1.0
Nodes (1): ADR Decision Template

### Community 15 - "API Design Template"
Cohesion: 1.0
Nodes (1): API Design Template

### Community 16 - "SDD Template"
Cohesion: 1.0
Nodes (1): SDD Design Template

### Community 17 - "SRS Template"
Cohesion: 1.0
Nodes (1): SRS Requirement Template

### Community 18 - "Test Plan Template"
Cohesion: 1.0
Nodes (1): Test Plan Template

### Community 19 - "README Sync Script"
Cohesion: 1.0
Nodes (0): 

## Ambiguous Edges - Review These
- `Default Workflow Policy` → `Industry Handoff Alignment`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Install Skills Behavior Tests` → `Cursor AGENTS Durable Context Instruction`  [AMBIGUOUS]
  src/test/install-skills.spec.ts · relation: conceptually_related_to

## Knowledge Gaps
- **29 isolated node(s):** `ADR Decision Template`, `API Design Template`, `SDD Design Template`, `SRS Requirement Template`, `Test Plan Template` (+24 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Path Normalization Helpers`** (2 nodes): `toPosix()`, `toStoreRelPath()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `ADR Template`** (1 nodes): `ADR Decision Template`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `API Design Template`** (1 nodes): `API Design Template`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `SDD Template`** (1 nodes): `SDD Design Template`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `SRS Template`** (1 nodes): `SRS Requirement Template`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Test Plan Template`** (1 nodes): `Test Plan Template`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `README Sync Script`** (1 nodes): `sync-cli-readme.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Default Workflow Policy` and `Industry Handoff Alignment`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Install Skills Behavior Tests` and `Cursor AGENTS Durable Context Instruction`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `main()` connect `CLI Flag Parsing Utilities` to `Core Artifact Operations`, `Context Packaging Workflow`, `Validation and Doctor Checks`, `Policy and State Rules`, `Bootstrap Defaults and Init`, `Artifact Type Resolution`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `toPosix()` connect `Path Normalization Helpers` to `CLI Flag Parsing Utilities`, `Core Artifact Operations`, `Context Packaging Workflow`, `Local Registry Resolution`, `Validation and Doctor Checks`, `Policy and State Rules`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `Role Handoff Workflow` connect `Store Concepts and Features` to `Workspace Build and Docs`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `main()` (e.g. with `initContextStore()` and `getStoreInfo()`) actually correct?**
  _`main()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `initContextStore()` (e.g. with `main()` and `runInitWizard()`) actually correct?**
  _`initContextStore()` has 2 INFERRED edges - model-reasoned connections that need verification._