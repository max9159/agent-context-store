# Graph Report - .  (2026-05-07)

## Corpus Check
- Corpus is ~10,116 words - fits in a single context window. You may not need a graph.

## Summary
- 111 nodes · 221 edges · 15 communities detected
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_ACS Handoff Workflow|ACS Handoff Workflow]]
- [[_COMMUNITY_Development And Packaging|Development And Packaging]]
- [[_COMMUNITY_CLI Command Handling|CLI Command Handling]]
- [[_COMMUNITY_Core Store Initialization|Core Store Initialization]]
- [[_COMMUNITY_Validation And Doctor|Validation And Doctor]]
- [[_COMMUNITY_Artifact And Handoff Writes|Artifact And Handoff Writes]]
- [[_COMMUNITY_Test Harness|Test Harness]]
- [[_COMMUNITY_Local Store Registry|Local Store Registry]]
- [[_COMMUNITY_Context Package Builder|Context Package Builder]]
- [[_COMMUNITY_Storage Modes|Storage Modes]]
- [[_COMMUNITY_ADR Template|ADR Template]]
- [[_COMMUNITY_API Design Template|API Design Template]]
- [[_COMMUNITY_SDD Template|SDD Template]]
- [[_COMMUNITY_SRS Template|SRS Template]]
- [[_COMMUNITY_Test Plan Template|Test Plan Template]]

## God Nodes (most connected - your core abstractions)
1. `main()` - 15 edges
2. `validateContextStore()` - 13 edges
3. `toResultPath()` - 11 edges
4. `checkHandoff()` - 11 edges
5. `resolveStoreContext()` - 10 edges
6. `handleHandoff()` - 9 edges
7. `toPosix()` - 9 edges
8. `initContextStore()` - 9 edges
9. `createArtifact()` - 9 edges
10. `createHandoff()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Local Demo Flow` --conceptually_related_to--> `Role Handoff Workflow`  [INFERRED]
  DEVELOPMENT.md → README.md
- `Agent Context Store CLI Skill` --semantically_similar_to--> `Agent Context Store Toolkit`  [INFERRED] [semantically similar]
  packages/cli/agent-config/skills/agent-context-store/SKILL.md → README.md
- `Task Artifact Creation` --semantically_similar_to--> `Artifact Creation`  [INFERRED] [semantically similar]
  packages/cli/agent-config/skills/agent-context-store/SKILL.md → README.md
- `Phase 1 CLI Smoke Flow` --semantically_similar_to--> `Role Handoff Workflow`  [INFERRED] [semantically similar]
  examples/simple-sdlc/README.md → README.md
- `Handoff Creation` --semantically_similar_to--> `Role Handoff Workflow`  [INFERRED] [semantically similar]
  packages/cli/agent-config/skills/agent-context-store/SKILL.md → README.md

## Hyperedges (group relationships)
- **ACS Durable SDLC Workflow** — readme_artifact_creation, readme_handoff_workflow, readme_role_specific_context_package, readme_validation_and_indexing, readme_context_store_layout [EXTRACTED 1.00]
- **ACS Storage Mode Options** — readme_storage_modes, readme_in_repo_mode, readme_local_mode, readme_dedicated_mode [EXTRACTED 1.00]
- **Skill-Guided Handoff Flow** — skill_store_health_check, skill_task_artifact_creation, skill_handoff_creation, skill_handoff_check, skill_role_context_packaging, skill_completion_checklist [EXTRACTED 1.00]

## Communities

### Community 0 - "ACS Handoff Workflow"
Cohesion: 0.13
Nodes (24): Agent Context Store Toolkit, Artifact Creation, Context Store Layout, Git-Backed Schema-Validated Handoffs, Role Handoff Workflow, Rationale: Agents Use Durable Handoffs, Rationale: Durable User-Owned Context, Role-Specific Context Package (+16 more)

### Community 1 - "Development And Packaging"
Cohesion: 0.17
Nodes (13): Bundled Agent Config Packaging, Compiled Output Tests, Development Guide, Local Demo Flow, pnpm Workspace Monorepo, Project Layout, Rationale: Publish Agent Config With CLI, Rationale: Test Compiled Output (+5 more)

### Community 2 - "CLI Command Handling"
Cohesion: 0.41
Nodes (11): findAgentConfigRoot(), getStringFlag(), handleHandoff(), installSkills(), main(), parseArgs(), printHelp(), printResult() (+3 more)

### Community 3 - "Core Store Initialization"
Cohesion: 0.33
Nodes (7): computeProjectSlug(), findToolkitRoot(), initContextStore(), loadSchemaValidator(), readAssetText(), readContextTemplate(), writeIfMissing()

### Community 4 - "Validation And Doctor"
Cohesion: 0.31
Nodes (10): checkHandoff(), collectHandoffStructuralErrors(), collectSchemaErrors(), doctor(), extractArtifactPaths(), isRecord(), parseFrontmatter(), parseYamlObject() (+2 more)

### Community 5 - "Artifact And Handoff Writes"
Cohesion: 0.31
Nodes (10): appendAudit(), buildIndex(), createArtifact(), createHandoff(), emptyResult(), getStoreInfo(), renderTemplate(), resolveStoreContext() (+2 more)

### Community 6 - "Test Harness"
Cohesion: 0.22
Nodes (2): initStore(), runCli()

### Community 7 - "Local Store Registry"
Cohesion: 0.47
Nodes (6): getLocalBaseDir(), getLocalRegistryPath(), getProjectRegistryKey(), readLocalRegistry(), readLocalStoreRegistration(), writeLocalStoreRegistration()

### Community 8 - "Context Package Builder"
Cohesion: 0.53
Nodes (6): buildContextPackage(), findArtifactsForTask(), listFiles(), toPosix(), toResultPath(), toStoreRelPath()

### Community 9 - "Storage Modes"
Cohesion: 0.4
Nodes (5): Dedicated Store Mode, In-Repo Store Mode, Local Store Mode, Rationale: Start Lightweight and Upgrade, Store Modes

### Community 10 - "ADR Template"
Cohesion: 1.0
Nodes (1): ADR Decision Template

### Community 11 - "API Design Template"
Cohesion: 1.0
Nodes (1): API Design Template

### Community 12 - "SDD Template"
Cohesion: 1.0
Nodes (1): SDD Design Template

### Community 13 - "SRS Template"
Cohesion: 1.0
Nodes (1): SRS Requirement Template

### Community 14 - "Test Plan Template"
Cohesion: 1.0
Nodes (1): Test Plan Template

## Knowledge Gaps
- **21 isolated node(s):** `ADR Decision Template`, `API Design Template`, `SDD Design Template`, `SRS Requirement Template`, `Test Plan Template` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components.
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

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Role Handoff Workflow` connect `ACS Handoff Workflow` to `Development And Packaging`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `Agent Context Store Toolkit` connect `ACS Handoff Workflow` to `Storage Modes`, `Development And Packaging`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `main()` connect `CLI Command Handling` to `Context Package Builder`, `Core Store Initialization`, `Validation And Doctor`, `Artifact And Handoff Writes`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `main()` (e.g. with `initContextStore()` and `getStoreInfo()`) actually correct?**
  _`main()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ADR Decision Template`, `API Design Template`, `SDD Design Template` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ACS Handoff Workflow` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._