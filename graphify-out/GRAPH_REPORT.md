# Graph Report - D:/GitLab/_TRS/ai-agent-automation/ai-dev-automation-agent/next-phase/agent-context-store  (2026-05-06)

## Corpus Check
- Corpus is ~8,977 words - fits in a single context window. You may not need a graph.

## Summary
- 248 nodes · 505 edges · 20 communities detected
- Extraction: 75% EXTRACTED · 24% INFERRED · 1% AMBIGUOUS · INFERRED: 121 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_End-to-End Handoff Flow|End-to-End Handoff Flow]]
- [[_COMMUNITY_Core Library Implementation|Core Library Implementation]]
- [[_COMMUNITY_Review Fix Scenario|Review Fix Scenario]]
- [[_COMMUNITY_Base Templates And Rules|Base Templates And Rules]]
- [[_COMMUNITY_Review Smoke Scenario|Review Smoke Scenario]]
- [[_COMMUNITY_Requirements Readiness|Requirements Readiness]]
- [[_COMMUNITY_System Design Structure|System Design Structure]]
- [[_COMMUNITY_Approval State Model|Approval State Model]]
- [[_COMMUNITY_Evidence Source Hierarchy|Evidence Source Hierarchy]]
- [[_COMMUNITY_Test Planning|Test Planning]]
- [[_COMMUNITY_CLI Entry Point|CLI Entry Point]]
- [[_COMMUNITY_API Design Structure|API Design Structure]]
- [[_COMMUNITY_SA Context Package|SA Context Package]]
- [[_COMMUNITY_ADR Structure|ADR Structure]]
- [[_COMMUNITY_Definition of Done|Definition of Done]]
- [[_COMMUNITY_Smoke ADR Template|Smoke ADR Template]]
- [[_COMMUNITY_Smoke API Template|Smoke API Template]]
- [[_COMMUNITY_Smoke SDD Template|Smoke SDD Template]]
- [[_COMMUNITY_Smoke SRS Template|Smoke SRS Template]]
- [[_COMMUNITY_Smoke Test Template|Smoke Test Template]]

## God Nodes (most connected - your core abstractions)
1. `main()` - 13 edges
2. `validateContextStore()` - 11 edges
3. `Approval State Rules` - 11 edges
4. `Source Reference Rules` - 11 edges
5. `SRS Template` - 11 edges
6. `Login with OTP System Design` - 10 edges
7. `Login with OTP` - 10 edges
8. `handleHandoff()` - 9 edges
9. `checkHandoff()` - 9 edges
10. `REQ-DEMO-0002 Artifact` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Generated Context Store Layout` --semantically_similar_to--> `Initialize Context Store`  [INFERRED] [semantically similar]
  README.md → packages/core/src/index.ts
- `Schema-Validated Artifact Handoff Toolkit` --conceptually_related_to--> `Validate Context Store`  [INFERRED]
  README.md → packages/core/src/index.ts
- `Approval State Valid States` --shares_data_with--> `Validate Context Store`  [INFERRED]
  tmp/final-smoke/docs/approval-state-rules.md → packages/core/src/index.ts
- `Explicit Durable Handoffs` --conceptually_related_to--> `Build Context Package`  [INFERRED]
  README.md → packages/core/src/index.ts
- `Minimal Context Package Goal` --rationale_for--> `Build Context Package`  [INFERRED]
  PHASE1_CLI_REVIEW_REPORT.md → packages/core/src/index.ts

## Hyperedges (group relationships)
- **Phase 1 CLI Workflow** — core_init_context_store, core_create_artifact, core_validate_context_store, core_create_handoff, core_build_context_package, core_build_index [EXTRACTED 1.00]
- **OTP Login Artifact Suite** — req_final_login_with_otp, sdd_final_login_with_otp_design, adr_final_use_redis_for_otp, api_final_otp_login_api, tc_final_otp_login_test_plan [INFERRED 0.90]
- **Toolkit Template Suite** — srs_template_requirement_record, sdd_template_design_record, adr_template_decision_record, api_design_template_contract, test_plan_template_traceability [EXTRACTED 1.00]
- **FIX-0001 Artifact Bundle** — adr_fix_0001_use_redis_for_otp, api_fix_0001_otp_login_api, sdd_fix_0001_login_with_otp_design, req_fix_0001_login_with_otp, tc_fix_0001_otp_login_test_plan [INFERRED 0.90]
- **Review Fix Governance Rules** — review_fix_approval_state_rules, review_fix_definition_of_done, review_fix_definition_of_ready, review_fix_source_reference_rules [INFERRED 0.86]
- **Review Fix Template Family** — review_fix_adr_adr_template, review_fix_api_design_api_template, review_fix_sdd_sdd_template, review_fix_srs_srs_template, review_fix_test_plan_test_plan_template [INFERRED 0.90]
- **OTP Delivery Artifact Bundle** — review_smoke2_adr_demo_0001, review_smoke2_api_demo_0001, review_smoke2_sdd_demo_0001, review_smoke2_req_demo_0001, review_smoke2_tc_demo_0001 [INFERRED 0.90]
- **Approval State Lifecycle** — draft_state, ready_for_review_state, changes_requested_state, approved_state, deprecated_state, superseded_state [EXTRACTED 1.00]
- **Definition of Ready Checklist** — required_fields_present, artifact_id_stability, source_references_recorded, open_questions_explicit [EXTRACTED 1.00]
- **Artifact Template Suite** — adr_template, api_design_template, sdd_template, srs_template, test_plan_template [INFERRED 0.86]
- **Artifact Template Suite** — adr_adr_template, api_design_api_design_template, sdd_sdd_template, srs_srs_template, test_plan_test_plan_template [INFERRED 0.93]
- **Delivery Governance Rules** — definition_of_done_definition_of_done, definition_of_ready_definition_of_ready, source_reference_rules_source_reference_rules [INFERRED 0.84]

## Communities

### Community 0 - "End-to-End Handoff Flow"
Cohesion: 0.09
Nodes (37): Use Redis for OTP, ADR Decision Template, Smoke ADR Template, API Design Template, Smoke API Design Template, OTP Login API, Approval State Valid States, CLI Handoff Command Flow (+29 more)

### Community 1 - "Core Library Implementation"
Cohesion: 0.18
Nodes (28): appendAudit(), buildContextPackage(), buildIndex(), checkHandoff(), collectHandoffStructuralErrors(), collectSchemaErrors(), createArtifact(), createHandoff() (+20 more)

### Community 2 - "Review Fix Scenario"
Cohesion: 0.1
Nodes (27): Use Redis for OTP, OTP Login API, SRS Template, Test Plan Template, FIX-0001 Dev Context Package, Excluded Because Not Required for Dev Role, Login with OTP, Login with OTP (+19 more)

### Community 3 - "Base Templates And Rules"
Cohesion: 0.13
Nodes (22): ADR Template, Decision Context, Selected Option, API Design Template, API Summary, Definition of Ready, Explicit Open Questions, Required Fields Present (+14 more)

### Community 4 - "Review Smoke Scenario"
Cohesion: 0.21
Nodes (21): Use Redis for OTP State, OTP Login API, Approval State Rules, Definition of Done, Definition of Ready, DEV Context Package, Validated artifacts and handoff continuity rationale, HOFF-DEMO-0001-BA-SA Handoff (+13 more)

### Community 5 - "Requirements Readiness"
Cohesion: 0.27
Nodes (21): Artifact IDs Are Stable, Business Goal, Definition of Ready, Open Questions, Open Questions Explicit, Login with OTP, REQ-DEMO-0001-R001, Date Check (+13 more)

### Community 6 - "System Design Structure"
Cohesion: 0.47
Nodes (11): Architecture, Components, Data Flow, Design Summary, Design Traceability To Source Artifacts, Integration Points, Requirement Artifacts, Risks And Constraints Explicit (+3 more)

### Community 7 - "Approval State Model"
Cohesion: 0.6
Nodes (10): Approval State Rules, approved, changes_requested, deprecated, draft, ready_for_review, review-smoke-3 Approval State Rules, review-smoke-4 Approval State Rules (+2 more)

### Community 8 - "Evidence Source Hierarchy"
Cohesion: 0.51
Nodes (10): Approved Artifacts, Prefer Authoritative Sources Over Chat History, Chat History, Commits, Issues, Meeting Notes, Pull Requests, review-smoke-3 Source Reference Rules (+2 more)

### Community 9 - "Test Planning"
Cohesion: 0.6
Nodes (10): Evidence, Evidence Location Recorded, Expected Results Explicit, review-smoke-2 Test Plan Template, review-smoke-3 Test Plan Template, review-smoke-4 Test Plan Template, Test Cases, Test Objective (+2 more)

### Community 10 - "CLI Entry Point"
Cohesion: 0.58
Nodes (8): getStringFlag(), handleHandoff(), main(), parseArgs(), printHelp(), printResult(), printValidation(), requireFlag()

### Community 11 - "API Design Structure"
Cohesion: 0.56
Nodes (9): Document Compatibility And Migration Impact, API Design Template, API Summary, Breaking Changes, Compatibility, Endpoints / Messages, Migration Notes, review-smoke-3 API Design Template (+1 more)

### Community 12 - "SA Context Package"
Cohesion: 0.25
Nodes (9): Artifacts Validated, Next-Role Context Package Generation, Definition of Done, Handoff Packages Present, DEMO-0001 SA Context Package, DEMO-0001 Task, HOFF-DEMO-0001-BA-SA Handoff, REQ-DEMO-0001 Requirement Artifact (+1 more)

### Community 13 - "ADR Structure"
Cohesion: 0.67
Nodes (7): ADR Consequences Section, ADR Context Section, ADR Decision Section, ADR Template, Capture Decision Trade-Offs And Follow-Up, review-smoke-3 ADR Template, review-smoke-4 ADR Template

### Community 14 - "Definition of Done"
Cohesion: 0.8
Nodes (6): Artifacts Are Validated, Definition of Done, Handoff Packages Present, Next-Role Context Package Generation, review-smoke-3 Definition of Done, review-smoke-4 Definition of Done

### Community 15 - "Smoke ADR Template"
Cohesion: 1.0
Nodes (2): ADR Template, ADR Template

### Community 16 - "Smoke API Template"
Cohesion: 1.0
Nodes (2): API Design Template, API Design Template

### Community 17 - "Smoke SDD Template"
Cohesion: 1.0
Nodes (2): SDD Template, SDD Template

### Community 18 - "Smoke SRS Template"
Cohesion: 1.0
Nodes (2): SRS Template, SRS Template

### Community 19 - "Smoke Test Template"
Cohesion: 1.0
Nodes (1): Test Plan Template

## Ambiguous Edges - Review These
- `Login with OTP` → `Approval State Rules`  [AMBIGUOUS]
  tmp/review-fix/docs/approval-state-rules.md · relation: conceptually_related_to
- `Login with OTP` → `Approval State Rules`  [AMBIGUOUS]
  tmp/review-smoke/docs/approval-state-rules.md · relation: conceptually_related_to
- `Approval State Rules` → `Login with OTP`  [AMBIGUOUS]
  tmp/smoke-demo/artifacts/requirements/REQ-DEMO-0001.md · relation: conceptually_related_to
- `Approval State Rules` → `Date Check`  [AMBIGUOUS]
  tmp/review-smoke-3/artifacts/requirements/REQ-DEMO-0002.md · relation: conceptually_related_to

## Knowledge Gaps
- **34 isolated node(s):** `Explicit Durable Handoffs`, `Generated Context Store Layout`, `SRS Template`, `Test Plan Template`, `ADR Template` (+29 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Smoke ADR Template`** (2 nodes): `ADR Template`, `ADR Template`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Smoke API Template`** (2 nodes): `API Design Template`, `API Design Template`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Smoke SDD Template`** (2 nodes): `SDD Template`, `SDD Template`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Smoke SRS Template`** (2 nodes): `SRS Template`, `SRS Template`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Smoke Test Template`** (1 nodes): `Test Plan Template`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Login with OTP` and `Approval State Rules`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Login with OTP` and `Approval State Rules`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Approval State Rules` and `Login with OTP`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Approval State Rules` and `Date Check`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Source Reference Rules` connect `Evidence Source Hierarchy` to `Requirements Readiness`, `System Design Structure`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `Source References Recorded` connect `Requirements Readiness` to `Evidence Source Hierarchy`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `Design Traceability To Source Artifacts` connect `System Design Structure` to `Evidence Source Hierarchy`, `Test Planning`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._