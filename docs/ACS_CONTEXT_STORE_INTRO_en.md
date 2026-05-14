# ACS Context Store Full Content Guide (`project-context-store` example)

---

## Chapter 1: Directory Layout After Setup and File Purposes

### 1.1 Directory Layout (Actual Inventory)

```text
project-context-store/
├─ config.yaml
├─ index.json
├─ artifact-types/
│  ├─ acceptance-criteria.yaml
│  ├─ adr.yaml
│  ├─ api-design.yaml
│  ├─ code-review-note.yaml
│  ├─ context-package.yaml
│  ├─ defect-report.yaml
│  ├─ handoff-package.yaml
│  ├─ implementation-note.yaml
│  ├─ qa-signoff.yaml
│  ├─ release-readiness-report.yaml
│  ├─ sdd.yaml
│  ├─ srs.yaml
│  ├─ test-case.yaml
│  ├─ test-plan.yaml
│  ├─ unit-test-note.yaml
│  └─ user-story.yaml
├─ artifacts/
│  └─ DEMO-0001/
│     ├─ acceptance-criteria/AC-DEMO-0001.md
│     ├─ sdd/SDD-DEMO-0001.md
│     ├─ srs/SRS-DEMO-0001.md
│     └─ user-story/US-DEMO-0001.md
├─ audit/
│  └─ 2026-05-08.log
├─ docs/
│  ├─ approval-state-rules.md
│  ├─ definition-of-done.md
│  ├─ definition-of-ready.md
│  └─ source-reference-rules.md
├─ handoffs/
│  └─ DEMO-0001/HOFF-DEMO-0001-BA-SA.yaml
├─ packages/
│  ├─ DEMO-0001/sa.context.md
│  └─ DEOM-0001/sa.context.md
├─ roles/
│  ├─ ba.yaml
│  ├─ dev.yaml
│  ├─ qa.yaml
│  └─ sa.yaml
├─ schemas/
│  ├─ acs.schema.json
│  ├─ approval.schema.json
│  ├─ artifact-type.schema.json
│  ├─ artifact.schema.json
│  ├─ context-package.schema.json
│  ├─ context-summary.schema.json
│  ├─ handoff.schema.json
│  ├─ role.schema.json
│  └─ workflow.schema.json
├─ templates/
│  ├─ acceptance-criteria.md
│  ├─ adr.md
│  ├─ api-design.md
│  ├─ code-review-note.md
│  ├─ defect-report.md
│  ├─ implementation-note.md
│  ├─ qa-signoff.md
│  ├─ release-readiness-report.md
│  ├─ sdd.md
│  ├─ srs.md
│  ├─ test-case.md
│  ├─ test-plan.md
│  ├─ unit-test-note.md
│  └─ user-story.md
└─ workflows/
   └─ default-sdlc.yaml
```

> Note: the new ACS artifact layout uses a task-first structure:
> `artifacts/{task_id}/{type}/{artifact_id}.md`.
> The old type-first structure, such as `artifacts/srs/SRS-DEMO-0001.md`, is no longer the supported canonical layout.

### 1.2 Purpose Overview for Each File (Table)

| File path | Purpose | Primary user |
| --- | --- | --- |
| `config.yaml` | Basic ACS store settings, including version, mode, and CLI name | AI Agent |
| `index.json` | Fast index for all artifacts and handoffs | AI Agent |
| `workflows/default-sdlc.yaml` | Defines the BA -> SA -> DEV -> QA -> Release stages and handoff rules | AI Agent |
| `roles/ba.yaml` | BA permissions, creatable outputs, handoff targets, and package policy | AI Agent |
| `roles/sa.yaml` | SA permissions, creatable outputs, handoff targets, and package policy | AI Agent |
| `roles/dev.yaml` | DEV permissions, creatable outputs, handoff targets, and package policy | AI Agent |
| `roles/qa.yaml` | QA permissions, creatable outputs, handoff targets, and package policy | AI Agent |
| `artifact-types/srs.yaml` | SRS type definition, including template, ID prefix, and permissions | AI Agent |
| `artifact-types/user-story.yaml` | User Story type definition | AI Agent |
| `artifact-types/acceptance-criteria.yaml` | Acceptance Criteria type definition | AI Agent |
| `artifact-types/sdd.yaml` | SDD type definition | AI Agent |
| `artifact-types/adr.yaml` | ADR type definition | AI Agent |
| `artifact-types/api-design.yaml` | API Design type definition | AI Agent |
| `artifact-types/implementation-note.yaml` | Implementation Note type definition | AI Agent |
| `artifact-types/unit-test-note.yaml` | Unit Test Note type definition | AI Agent |
| `artifact-types/code-review-note.yaml` | Code Review Note type definition | AI Agent |
| `artifact-types/test-plan.yaml` | Test Plan type definition | AI Agent |
| `artifact-types/test-case.yaml` | Test Case type definition | AI Agent |
| `artifact-types/defect-report.yaml` | Defect Report type definition | AI Agent |
| `artifact-types/qa-signoff.yaml` | QA Signoff type definition | AI Agent |
| `artifact-types/release-readiness-report.yaml` | Release Readiness type definition | AI Agent |
| `artifact-types/handoff-package.yaml` | Handoff Package type definition | AI Agent |
| `artifact-types/context-package.yaml` | Context Package type definition | AI Agent |
| `templates/srs.md` | SRS generation template | AI Agent |
| `templates/user-story.md` | User Story generation template | AI Agent |
| `templates/acceptance-criteria.md` | Acceptance Criteria generation template | AI Agent |
| `templates/sdd.md` | SDD generation template | AI Agent |
| `templates/adr.md` | ADR generation template | AI Agent |
| `templates/api-design.md` | API Design generation template | AI Agent |
| `templates/implementation-note.md` | Implementation Note template | AI Agent |
| `templates/unit-test-note.md` | Unit Test Note template | AI Agent |
| `templates/code-review-note.md` | Code Review Note template | AI Agent |
| `templates/test-plan.md` | Test Plan template | AI Agent |
| `templates/test-case.md` | Test Case template | AI Agent |
| `templates/defect-report.md` | Defect Report template | AI Agent |
| `templates/qa-signoff.md` | QA Signoff template | AI Agent |
| `templates/release-readiness-report.md` | Release Readiness template | AI Agent |
| `schemas/acs.schema.json` | Schema for ACS configuration structure | AI Agent |
| `schemas/artifact.schema.json` | Schema for artifact front matter | AI Agent |
| `schemas/artifact-type.schema.json` | Schema for artifact type definitions | AI Agent |
| `schemas/role.schema.json` | Schema for role profiles | AI Agent |
| `schemas/workflow.schema.json` | Schema for workflow definitions | AI Agent |
| `schemas/handoff.schema.json` | Handoff file schema, currently permissive | AI Agent |
| `schemas/context-package.schema.json` | Context package schema, currently permissive | AI Agent |
| `schemas/context-summary.schema.json` | Context summary schema, currently permissive | AI Agent |
| `schemas/approval.schema.json` | Approval structure schema, currently permissive | AI Agent |
| `docs/definition-of-ready.md` | Definition of Ready rule guide | User, AI Agent |
| `docs/definition-of-done.md` | Definition of Done rule guide | User, AI Agent |
| `docs/approval-state-rules.md` | Definition of available approval states | User, AI Agent |
| `docs/source-reference-rules.md` | Rules for source reference priority | User, AI Agent |
| `handoffs/DEMO-0001/HOFF-DEMO-0001-BA-SA.yaml` | BA-to-SA task handoff package content | User + AI Agent |
| `artifacts/DEMO-0001/srs/SRS-DEMO-0001.md` | DEMO-0001 requirements specification | User + AI Agent |
| `artifacts/DEMO-0001/user-story/US-DEMO-0001.md` | DEMO-0001 user story | User + AI Agent |
| `artifacts/DEMO-0001/acceptance-criteria/AC-DEMO-0001.md` | DEMO-0001 acceptance criteria | User + AI Agent |
| `artifacts/DEMO-0001/sdd/SDD-DEMO-0001.md` | DEMO-0001 system design | User + AI Agent |
| `packages/DEMO-0001/sa.context.md` | Context package for SA | AI Agent |
| `packages/DEOM-0001/sa.context.md` | Context package for SA, empty-package example | AI Agent |
| `audit/2026-05-08.log` | Audit event stream for artifact creation, handoff creation, package builds, and index rebuilds | User, AI Agent |

---

## Chapter 2: Detailed File Field and Property Guide (One Section Per File)

### config.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `version` | Configuration file format version, currently `1` | AI Agent |
| `toolkit` | Tool identifier, `agent-context-store` | AI Agent |
| `cli` | CLI command name, `acs` | User + AI Agent |
| `mode` | Store mode, currently `dedicated` | User for configuration, AI Agent for reading |

### index.json

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `generated_at` | Index generation time in ISO format | AI Agent |
| `artifacts[]` | Artifact list array | AI Agent |
| `artifacts[].id` | Artifact ID, such as `SRS-DEMO-0001` | User + AI Agent |
| `artifacts[].type` | Artifact type, such as `srs` or `sdd` | AI Agent |
| `artifacts[].title` | Document title | User + AI Agent |
| `artifacts[].version` | Document version, such as `v0.1` | User + AI Agent |
| `artifacts[].status` | Status, such as `draft` | User + AI Agent |
| `artifacts[].approvalStatus` | Approval status, such as `pending` | User + AI Agent |
| `artifacts[].path` | Actual artifact file path | AI Agent |
| `handoffs[]` | Handoff file path array | AI Agent |

### default-sdlc.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `workflow` | Workflow ID, `default-sdlc` | AI Agent |
| `display_name` | Workflow display name | User + AI Agent |
| `stages[]` | Stage definition array | AI Agent |
| `stages[].id` | Stage code, such as `requirement` or `system-design` | AI Agent |
| `stages[].name` | Stage name | User + AI Agent |
| `stages[].owner` | Role responsible for the stage, such as `ba`, `sa`, `dev`, or `qa` | AI Agent |
| `stages[].inputs` | Artifact types required to enter this stage | AI Agent |
| `stages[].outputs` | Artifact types produced by this stage | AI Agent |
| `stages[].next` | List of next stage IDs | AI Agent |
| `handoff_rules[]` | Role handoff rules | AI Agent |
| `handoff_rules[].from/to` | Handoff role direction | AI Agent |
| `handoff_rules[].required_artifacts` | Artifact types required for handoff | AI Agent |
| `handoff_rules[].required_state` | Required state for handoff, such as `approved` | AI Agent |

### ba.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `role` | Role code, `ba` | AI Agent |
| `display_name` | Role name, Business Analyst | User + AI Agent |
| `can_create` | Types BA can create: `srs`, `user-story`, `acceptance-criteria`, `handoff-package` | AI Agent |
| `can_read` | Types BA can read | AI Agent |
| `can_update` | Types BA can update | AI Agent |
| `default_templates` | Mapping from artifact type to template file name | AI Agent |
| `handoff_targets` | BA handoff target, `sa` | AI Agent |
| `package_policy.include/exclude` | Include and exclude rules when building a context package | AI Agent |

### sa.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `role` | Role code, `sa` | AI Agent |
| `display_name` | Role name, System Architect | User + AI Agent |
| `can_create` | Types SA can create: `sdd`, `adr`, `api-design`, `handoff-package` | AI Agent |
| `can_read` | Types SA can read, including BA and SA outputs | AI Agent |
| `can_update` | Types SA can update | AI Agent |
| `default_templates` | Template mapping for SA types | AI Agent |
| `handoff_targets` | SA handoff targets, `dev` and `qa` | AI Agent |
| `package_policy.include/exclude` | Include and exclude rules for SA context packages | AI Agent |

### dev.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `role` | Role code, `dev` | AI Agent |
| `display_name` | Role name, Developer | User + AI Agent |
| `can_create` | Types DEV can create: `implementation-note`, `unit-test-note`, `code-review-note`, `handoff-package` | AI Agent |
| `can_read` | Types DEV can read | AI Agent |
| `can_update` | Types DEV can update | AI Agent |
| `default_templates` | Template mapping for DEV types | AI Agent |
| `handoff_targets` | DEV handoff target, `qa` | AI Agent |
| `package_policy.include/exclude` | Include and exclude rules for DEV context packages | AI Agent |

### qa.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `role` | Role code, `qa` | AI Agent |
| `display_name` | Role name, QA Tester | User + AI Agent |
| `can_create` | Types QA can create: `test-plan`, `test-case`, `defect-report`, `qa-signoff` | AI Agent |
| `can_read` | Types QA can read | AI Agent |
| `can_update` | Types QA can update | AI Agent |
| `default_templates` | Template mapping for QA types | AI Agent |
| `handoff_targets` | QA handoff targets, `dev` and `sa` | AI Agent |
| `package_policy.include/exclude` | Include and exclude rules for QA context packages | AI Agent |

### srs.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | `type`, `display_name`, `template`, `id_prefix`, `default_owner`, `aliases`, `required_fields`, `allowed_roles` | AI Agent |
| Values defined by this file | `type=srs`, `template=srs.md`, `id_prefix=SRS`, `default_owner=ba`, `required_fields=[task_id,title]` | AI Agent |
| `allowed_roles` | `create/update=ba`, `read=ba,sa,dev,qa` | AI Agent |

### user-story.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=user-story`, `template=user-story.md`, `id_prefix=US`, `default_owner=ba` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,title]`; `create/update=ba`; `read=ba,sa,dev,qa` | AI Agent |

### acceptance-criteria.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=acceptance-criteria`, `template=acceptance-criteria.md`, `id_prefix=AC`, `default_owner=ba` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,title]`; `create/update=ba`; `read=ba,sa,dev,qa` | AI Agent |

### sdd.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=sdd`, `template=sdd.md`, `id_prefix=SDD`, `default_owner=sa` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,title]`; `create/update=sa`; `read=ba,sa,dev,qa` | AI Agent |

### adr.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=adr`, `template=adr.md`, `id_prefix=ADR`, `default_owner=sa` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[decision,context,consequences]`; `create/update=sa`; `read=sa,dev,qa` | AI Agent |

### api-design.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=api-design`, `template=api-design.md`, `id_prefix=API`, `default_owner=sa`, `aliases=[api]` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,title]`; `create/update=sa`; `read=sa,dev,qa` | AI Agent |

### implementation-note.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=implementation-note`, `template=implementation-note.md`, `id_prefix=IMPL`, `default_owner=dev` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,changed_files]`; `create/update=dev`; `read=sa,dev,qa` | AI Agent |

### unit-test-note.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=unit-test-note`, `template=unit-test-note.md`, `id_prefix=UNIT`, `default_owner=dev` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,unit_tests]`; `create/update=dev`; `read=dev,qa` | AI Agent |

### code-review-note.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=code-review-note`, `template=code-review-note.md`, `id_prefix=CR`, `default_owner=dev` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,review_summary]`; `create/update=dev`; `read=dev,qa` | AI Agent |

### test-plan.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=test-plan`, `template=test-plan.md`, `id_prefix=TEST`, `default_owner=qa`, `aliases=[test]` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,test_scope]`; `create/update=qa`; `read=sa,dev,qa` | AI Agent |

### test-case.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=test-case`, `template=test-case.md`, `id_prefix=TC`, `default_owner=qa` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,test_steps]`; `create/update=qa`; `read=dev,qa` | AI Agent |

### defect-report.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=defect-report`, `template=defect-report.md`, `id_prefix=BUG`, `default_owner=qa` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,actual_result]`; `create/update=qa`; `read=dev,qa` | AI Agent |

### qa-signoff.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=qa-signoff`, `template=qa-signoff.md`, `id_prefix=QA`, `default_owner=qa` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,signoff_state]`; `create/update=qa`; `read=sa,dev,qa` | AI Agent |

### release-readiness-report.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=release-readiness-report`, `template=release-readiness-report.md`, `id_prefix=REL`, `default_owner=sa` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,release_decision]`; `create/update=sa`; `read=sa,dev,qa` | AI Agent |

### handoff-package.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=handoff-package`, `template=implementation-note.md`, `id_prefix=HO`, `default_owner=system` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id]`; `create/update=ba,sa,dev`; `read=ba,sa,dev,qa` | AI Agent |

### context-package.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Common fields | Same shared artifact-type definition | AI Agent |
| Values defined by this file | `type=context-package`, `template=implementation-note.md`, `id_prefix=CTX`, `default_owner=system` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id]`; `create=[]`; `update=[]`; `read=ba,sa,dev,qa` | AI Agent |

### srs.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter fields | `id`, `type`, `task_id`, `title`, `owner`, `status`, `version`, `approval_status`, `last_updated`, `source_refs`, `depends_on`, `outputs` | AI Agent |
| Placeholder | Replaced with `{{ARTIFACT_ID}}`, `{{TYPE}}`, `{{TASK_ID}}`, `{{TITLE}}`, `{{OWNER}}`, and `{{DATE}}` | AI Agent |
| Document sections | `# {{TITLE}}`, `## Software Requirements Specification`, `## Source References` | User + AI Agent |

### user-story.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter fields | Same common fields as `srs.md` | AI Agent |
| Placeholder | Same shared template placeholders | AI Agent |
| Document sections | `## User Story`, `## Source References` | User + AI Agent |

### acceptance-criteria.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter fields | Same common fields as `srs.md` | AI Agent |
| Placeholder | Same shared template placeholders | AI Agent |
| Document sections | `## Acceptance Criteria`, `## Source References` | User + AI Agent |

### sdd.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter fields | Same common fields as `srs.md` | AI Agent |
| Placeholder | Same shared template placeholders | AI Agent |
| Document sections | `## System Design Document`, `## Source References` | User + AI Agent |

### adr.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter fields | Same common fields as `srs.md` | AI Agent |
| Placeholder | Same shared template placeholders | AI Agent |
| Document sections | `## Architecture Decision Record`, `## Source References` | User + AI Agent |

### api-design.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter fields | Same common fields as `srs.md` | AI Agent |
| Placeholder | Same shared template placeholders | AI Agent |
| Document sections | `## API Design`, `## Source References` | User + AI Agent |

### implementation-note.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter fields | Same common fields as `srs.md` | AI Agent |
| Placeholder | Same shared template placeholders | AI Agent |
| Document sections | `## Implementation Note`, `## Source References` | User + AI Agent |

### unit-test-note.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter fields | Same common fields as `srs.md` | AI Agent |
| Placeholder | Same shared template placeholders | AI Agent |
| Document sections | `## Unit Test Note`, `## Source References` | User + AI Agent |

### code-review-note.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter fields | Same common fields as `srs.md` | AI Agent |
| Placeholder | Same shared template placeholders | AI Agent |
| Document sections | `## Code Review Note`, `## Source References` | User + AI Agent |

### test-plan.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter fields | Same common fields as `srs.md` | AI Agent |
| Placeholder | Same shared template placeholders | AI Agent |
| Document sections | `## Test Plan`, `## Source References` | User + AI Agent |

### test-case.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter fields | Same common fields as `srs.md` | AI Agent |
| Placeholder | Same shared template placeholders | AI Agent |
| Document sections | `## Test Case`, `## Source References` | User + AI Agent |

### defect-report.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter fields | Same common fields as `srs.md` | AI Agent |
| Placeholder | Same shared template placeholders | AI Agent |
| Document sections | `## Defect Report`, `## Source References` | User + AI Agent |

### qa-signoff.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter fields | Same common fields as `srs.md` | AI Agent |
| Placeholder | Same shared template placeholders | AI Agent |
| Document sections | `## QA Signoff`, `## Source References` | User + AI Agent |

### release-readiness-report.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter fields | Same common fields as `srs.md` | AI Agent |
| Placeholder | Same shared template placeholders | AI Agent |
| Document sections | `## Release Readiness Report`, `## Source References` | User + AI Agent |

### acs.schema.json

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `$schema`, `$id`, `title`, `type` | Basic schema identification information | AI Agent |
| `required` | Required root fields: `version`, `project`, `store`, `roles`, `artifact_types`, `naming` | AI Agent |
| `properties.project` | Requires `default_workflow` | AI Agent |
| `properties.store` | Defines `mode` (`in-repo/local/dedicated`) and `project_path` | AI Agent |
| `properties.roles` | Role list, minimum 1 | AI Agent |
| `properties.artifact_types` | Artifact type list, minimum 1 | AI Agent |
| `properties.naming` | Requires `artifact_path`, `handoff_path`, and `package_path`; the new default `artifact_path` is `artifacts/{task_id}/{type}/{artifact_id}.{ext}` | AI Agent |

### artifact.schema.json

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `$schema`, `$id`, `title`, `type` | Basic schema identification information | AI Agent |
| `required` | Required artifact metadata: `id`, `type`, `title`, `owner`, `status`, `version`, `approval_status`, `last_updated`, `source_refs` | AI Agent |
| `status` enum | `draft`, `ready_for_review`, `changes_requested`, `approved`, `deprecated`, `superseded` | AI Agent |
| `approval_status` enum | `pending`, `approved`, `changes_requested`, `deprecated`, `superseded` | AI Agent |
| `depends_on`, `outputs` | Dependency and output lists, optional | AI Agent |

### artifact-type.schema.json

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `required` | `type`, `display_name`, `template`, `id_prefix`, `default_owner`, `required_fields`, `allowed_roles` | AI Agent |
| `allowed_roles` | Must include three permission arrays: `create`, `update`, and `read` | AI Agent |
| `aliases`/`schema`/`path_template` | Type aliases and additional specification extensions | AI Agent |
| `additionalProperties: false` | Disallows undefined fields to keep artifact-type files consistent | AI Agent |

### role.schema.json

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `required` | `role`, `display_name`, `can_create`, `can_read`, `can_update`, `handoff_targets`, `package_policy` | AI Agent |
| `default_templates` | Default template mapping for each artifact type | AI Agent |
| `package_policy.include/exclude` | Include and exclude rules for context packages | AI Agent |
| `additionalProperties: false` | Restricts role configuration fields to avoid drift | AI Agent |

### workflow.schema.json

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `required` | `workflow`, `display_name`, `stages`, `handoff_rules` | AI Agent |
| `stages[]` | Required stage object fields: `id`, `name`, `owner`, `inputs`, `outputs`, `next` | AI Agent |
| `handoff_rules[]` | Required rule object fields: `from`, `to`, `required_artifacts`, `required_state` | AI Agent |
| `additionalProperties: false` | Strictly constrains the workflow file format | AI Agent |

### handoff.schema.json

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `$schema` | JSON Schema version declaration | AI Agent |
| `type` | Currently only requires object type | AI Agent |
| `additionalProperties: true` | Currently a permissive schema that allows arbitrary fields | AI Agent |

### context-package.schema.json

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `$schema` | JSON Schema version declaration | AI Agent |
| `type` | Currently only requires object type | AI Agent |
| `additionalProperties: true` | Currently a permissive schema that allows arbitrary fields | AI Agent |

### context-summary.schema.json

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `$schema` | JSON Schema version declaration | AI Agent |
| `type` | Currently only requires object type | AI Agent |
| `additionalProperties: true` | Currently a permissive schema that allows arbitrary fields | AI Agent |

### approval.schema.json

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `$schema` | JSON Schema version declaration | AI Agent |
| `type` | Currently only requires object type | AI Agent |
| `additionalProperties: true` | Currently a permissive schema that allows arbitrary fields | AI Agent |

### definition-of-ready.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `# Definition of Ready` | Document title | User |
| Checklist items | Requires complete fields, stable IDs, source references, and traceable open questions | User, AI Agent |

### definition-of-done.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `# Definition of Done` | Document title | User |
| Checklist items | Requires artifact validation, an existing handoff package, and the ability to generate the next role's context package | User, AI Agent |

### approval-state-rules.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `# Approval State Rules` | Document title | User |
| `Valid states` | Defines valid states: `draft`, `ready_for_review`, `changes_requested`, `approved`, `deprecated`, `superseded` | User + AI Agent |

### source-reference-rules.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `# Source Reference Rules` | Document title | User |
| Reference priority rules | Prefer approved artifacts, issues, commits, PRs, and meeting notes over chat history | User + AI Agent |

### HOFF-DEMO-0001-BA-SA.yaml

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `id` | Handoff ID | User + AI Agent |
| `task_id` | Task ID, `DEMO-0001` | User + AI Agent |
| `from_role` / `to_role` | Handoff role direction, BA -> SA | User + AI Agent |
| `handoff_type` | Handoff type, `role_handoff` | AI Agent |
| `status` | Current handoff state, `ready_for_review` | User + AI Agent |
| `approval_status` | Approval status, `pending` | User + AI Agent |
| `artifacts.required[]` | Required artifact paths, types, versions, and summaries | User + AI Agent |
| `context_summary` | Summary for this handoff | User + AI Agent |
| `open_questions[]` | List of questions still requiring clarification | User + AI Agent |
| `readiness.dor_status` / `blocking_questions` | Readiness level and blocking questions | User + AI Agent |

### SRS-DEMO-0001.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter | `id`, `type`, `task_id`, `title`, `owner`, `status`, `version`, `approval_status`, `last_updated`, `source_refs`, `depends_on`, `outputs` | AI Agent |
| `## 1. Background` | Problem background, removing the account input from the login page | User + AI Agent |
| `## 2. Business Goal` | Business goal, reducing login friction | User + AI Agent |
| `## 3. Scope` | In Scope and Out of Scope | User + AI Agent |
| `## 4. Functional Requirements` | Functional requirements table, FR-001 through FR-007 | User + AI Agent |
| `## 5. Non-Functional Requirements` | Security, compatibility, usability, and other non-functional requirements | User + AI Agent |
| `## 6. Acceptance Criteria` | Description of verifiable acceptance conditions | User + AI Agent |
| `## 7. Open Questions` | Issues awaiting clarification from SA or DEV | User + AI Agent |
| `## 8. Validation Checklist` | Document completeness checklist | User + AI Agent |
| `## Source References` | Requirement source reference list | User + AI Agent |

### US-DEMO-0001.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter | Same shared artifact metadata fields | AI Agent |
| `## Primary Story` | Main As a / I want / so that story | User + AI Agent |
| `## Business Value` | Business value explanation | User + AI Agent |
| `## User Journey` | User flow steps | User + AI Agent |
| `## Edge Cases` | Edge conditions | User + AI Agent |
| `## Open Questions` | Issues awaiting clarification | User + AI Agent |
| `## Validation Checklist` | Document quality checklist | User + AI Agent |
| `## Source References` | Source references | User + AI Agent |

### AC-DEMO-0001.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter | Same shared artifact metadata fields | AI Agent |
| `Scenario AC-001 ~ AC-006` | Acceptance scenarios covering display, submission, validation, failure behavior, context source, and layout | User + AI Agent |
| `## Out of Scope For Acceptance` | Scope not covered by acceptance | User + AI Agent |
| `## Validation Checklist` | Acceptance criteria document quality checklist | User + AI Agent |
| `## Source References` | Source references | User + AI Agent |

### SDD-DEMO-0001.md

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| Front matter | Same shared artifact metadata fields, including multiple `source_refs` | AI Agent |
| `## 1. Purpose` | Design purpose and scope | User + AI Agent |
| `## 2. Current State` | Frontend and backend current-state analysis | User + AI Agent |
| `## 3. Design Decisions` | Context source, API contract, UI naming, and documentation update strategy | User + AI Agent |
| `## 4. Component Impact` | Component impact table and DEV actions | User + AI Agent |
| `## 5. Sequence` | Mermaid sequence diagram | User + AI Agent |
| `## 6. Acceptance Mapping` | Mapping from FRs to design coverage | User + AI Agent |
| `## 7. Risks and Mitigations` | Risks and mitigation measures | User + AI Agent |
| `## 8. Test Strategy` | Test strategy, automated and manual | User + AI Agent |
| `## 9. Open Questions` | Open issues | User + AI Agent |
| `## 10. Validation Checklist` | Document checklist | User + AI Agent |
| `## Source References` | Design basis reference list | User + AI Agent |

### sa.context.md (`packages/DEMO-0001`)

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `# Context Package: DEMO-0001 / sa` | Context package title | AI Agent |
| `## Manifest` | Contains a JSON manifest | AI Agent |
| `manifest.task_id` / `role` / `generated_at` | Target task, role, and generation time for the package | AI Agent |
| `manifest.included_artifacts[]` | Included artifact list, with `path`, `type`, and `version` | AI Agent |
| `manifest.included_handoffs[]` | Included handoff list | AI Agent |
| `manifest.excluded_artifacts[]` | Excluded artifact list, empty in this file | AI Agent |
| `## Included/Excluded Artifacts` | Human-readable list | User + AI Agent |
| `## Included Handoffs` | Human-readable handoff list | User + AI Agent |

### sa.context.md (`packages/DEOM-0001`)

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `# Context Package: DEOM-0001 / sa` | Context package title, with task ID `DEOM-0001` | AI Agent |
| `## Manifest` | Contains a JSON manifest | AI Agent |
| `manifest.task_id` / `role` / `generated_at` | Package identification information | AI Agent |
| `manifest.included_artifacts[]` | Empty array in this file; no artifacts included | AI Agent |
| `manifest.included_handoffs[]` | Empty array in this file; no handoffs included | AI Agent |
| `manifest.excluded_artifacts[]` | Empty array in this file | AI Agent |
| List sections | Present but empty, indicating that an empty context package can be generated | User + AI Agent |

### 2026-05-08.log

| Field/property | Purpose | Primary user |
| --- | --- | --- |
| `timestamp` at the start of each line | Event time in ISO format | User, AI Agent |
| `action` text verb | Event type, such as `created artifact`, `created handoff`, `built context package`, or `rebuilt index` | User, AI Agent |
| `target` path | Path of the affected file | User, AI Agent |
| Event record per line | Forms an append-only audit trail for tracing who generated which file and when | User |

---

## Additional Notes

1. `schemas/handoff.schema.json`, `schemas/context-package.schema.json`, `schemas/context-summary.schema.json`, and `schemas/approval.schema.json` currently use permissive definitions with `additionalProperties: true`; in practice, content is mainly constrained by workflow rules and templates.
2. `packages/DEOM-0001/sa.context.md` and `packages/DEMO-0001/sa.context.md` coexist, which indicates a possible task ID typo (`DEOM` vs `DEMO`). To avoid confusion, consider adding task ID format validation to the workflow.
3. This guide covers ACS content files and does not include internal Git version control files.
