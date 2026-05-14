# ACS Context Store 完整內容說明（`project-context-store` 實例）

---

## 第1章：建置後目錄結構與每份檔案用途

### 1.1 目錄結構（實際盤點）

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

> 注意：ACS 新版 artifact layout 採 task-first 結構：
> `artifacts/{task_id}/{type}/{artifact_id}.md`。
> 舊版 type-first 結構（例如 `artifacts/srs/SRS-DEMO-0001.md`）不再是支援的 canonical layout。

### 1.2 每份檔案用途總覽（表格）

| 檔案路徑 | 用途 | 主要使用者 |
| --- | --- | --- |
| `config.yaml` | ACS store 基本設定（版本、模式、CLI 名稱） | AI Agent |
| `index.json` | 全部 artifact/handoff 快速索引 | AI Agent |
| `workflows/default-sdlc.yaml` | 定義 BA→SA→DEV→QA→Release 的階段與交接規則 | AI Agent |
| `roles/ba.yaml` | BA 權限、可產出物、交接目標與 package 政策 | AI Agent |
| `roles/sa.yaml` | SA 權限、可產出物、交接目標與 package 政策 | AI Agent |
| `roles/dev.yaml` | DEV 權限、可產出物、交接目標與 package 政策 | AI Agent |
| `roles/qa.yaml` | QA 權限、可產出物、交接目標與 package 政策 | AI Agent |
| `artifact-types/srs.yaml` | SRS 類型定義（模板、ID 前綴、權限） | AI Agent |
| `artifact-types/user-story.yaml` | User Story 類型定義 | AI Agent |
| `artifact-types/acceptance-criteria.yaml` | Acceptance Criteria 類型定義 | AI Agent |
| `artifact-types/sdd.yaml` | SDD 類型定義 | AI Agent |
| `artifact-types/adr.yaml` | ADR 類型定義 | AI Agent |
| `artifact-types/api-design.yaml` | API Design 類型定義 | AI Agent |
| `artifact-types/implementation-note.yaml` | Implementation Note 類型定義 | AI Agent |
| `artifact-types/unit-test-note.yaml` | Unit Test Note 類型定義 | AI Agent |
| `artifact-types/code-review-note.yaml` | Code Review Note 類型定義 | AI Agent |
| `artifact-types/test-plan.yaml` | Test Plan 類型定義 | AI Agent |
| `artifact-types/test-case.yaml` | Test Case 類型定義 | AI Agent |
| `artifact-types/defect-report.yaml` | Defect Report 類型定義 | AI Agent |
| `artifact-types/qa-signoff.yaml` | QA Signoff 類型定義 | AI Agent |
| `artifact-types/release-readiness-report.yaml` | Release Readiness 類型定義 | AI Agent |
| `artifact-types/handoff-package.yaml` | Handoff Package 類型定義 | AI Agent |
| `artifact-types/context-package.yaml` | Context Package 類型定義 | AI Agent |
| `templates/srs.md` | SRS 產生模板 | AI Agent |
| `templates/user-story.md` | User Story 產生模板 | AI Agent |
| `templates/acceptance-criteria.md` | Acceptance Criteria 產生模板 | AI Agent |
| `templates/sdd.md` | SDD 產生模板 | AI Agent |
| `templates/adr.md` | ADR 產生模板 | AI Agent |
| `templates/api-design.md` | API Design 產生模板 | AI Agent |
| `templates/implementation-note.md` | Implementation Note 模板 | AI Agent |
| `templates/unit-test-note.md` | Unit Test Note 模板 | AI Agent |
| `templates/code-review-note.md` | Code Review Note 模板 | AI Agent |
| `templates/test-plan.md` | Test Plan 模板 | AI Agent |
| `templates/test-case.md` | Test Case 模板 | AI Agent |
| `templates/defect-report.md` | Defect Report 模板 | AI Agent |
| `templates/qa-signoff.md` | QA Signoff 模板 | AI Agent |
| `templates/release-readiness-report.md` | Release Readiness 模板 | AI Agent |
| `schemas/acs.schema.json` | ACS 設定結構 schema | AI Agent |
| `schemas/artifact.schema.json` | Artifact front matter schema | AI Agent |
| `schemas/artifact-type.schema.json` | Artifact type 定義 schema | AI Agent |
| `schemas/role.schema.json` | Role profile schema | AI Agent |
| `schemas/workflow.schema.json` | Workflow 定義 schema | AI Agent |
| `schemas/handoff.schema.json` | Handoff 文件 schema（目前寬鬆） | AI Agent |
| `schemas/context-package.schema.json` | Context package schema（目前寬鬆） | AI Agent |
| `schemas/context-summary.schema.json` | Context summary schema（目前寬鬆） | AI Agent |
| `schemas/approval.schema.json` | Approval 結構 schema（目前寬鬆） | AI Agent |
| `docs/definition-of-ready.md` | DoR 規則說明 | 使用者、AI Agent |
| `docs/definition-of-done.md` | DoD 規則說明 | 使用者、AI Agent |
| `docs/approval-state-rules.md` | 可用審核狀態定義 | 使用者、AI Agent |
| `docs/source-reference-rules.md` | 引用來源優先順序規則 | 使用者、AI Agent |
| `handoffs/DEMO-0001/HOFF-DEMO-0001-BA-SA.yaml` | BA→SA 任務交接包內容 | 使用者 + AI Agent |
| `artifacts/DEMO-0001/srs/SRS-DEMO-0001.md` | DEMO-0001 需求規格 | 使用者 + AI Agent |
| `artifacts/DEMO-0001/user-story/US-DEMO-0001.md` | DEMO-0001 使用者故事 | 使用者 + AI Agent |
| `artifacts/DEMO-0001/acceptance-criteria/AC-DEMO-0001.md` | DEMO-0001 驗收條件 | 使用者 + AI Agent |
| `artifacts/DEMO-0001/sdd/SDD-DEMO-0001.md` | DEMO-0001 系統設計 | 使用者 + AI Agent |
| `packages/DEMO-0001/sa.context.md` | 提供 SA 的 context package | AI Agent |
| `packages/DEOM-0001/sa.context.md` | 提供 SA 的 context package（空包案例） | AI Agent |
| `audit/2026-05-08.log` | 事件稽核流水（建立 artifact、handoff、index） | 使用者、AI Agent |

---

## 第2章：逐檔案欄位/屬性詳細說明（每檔案一節）

### config.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `version` | 設定檔格式版本（目前值 `1`） | AI Agent |
| `toolkit` | 工具識別名稱（`agent-context-store`） | AI Agent |
| `cli` | CLI 命令名稱（`acs`） | 使用者 + AI Agent |
| `mode` | store 模式（目前為 `dedicated`） | 使用者（設定）、AI Agent（讀取） |

### index.json

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `generated_at` | 索引產生時間（ISO 時間） | AI Agent |
| `artifacts[]` | Artifact 清單陣列 | AI Agent |
| `artifacts[].id` | Artifact ID（例如 `SRS-DEMO-0001`） | 使用者 + AI Agent |
| `artifacts[].type` | 類型（例如 `srs`, `sdd`） | AI Agent |
| `artifacts[].title` | 文件標題 | 使用者 + AI Agent |
| `artifacts[].version` | 文件版號（例如 `v0.1`） | 使用者 + AI Agent |
| `artifacts[].status` | 狀態（例如 `draft`） | 使用者 + AI Agent |
| `artifacts[].approvalStatus` | 審核狀態（例如 `pending`） | 使用者 + AI Agent |
| `artifacts[].path` | Artifact 實際檔案路徑 | AI Agent |
| `handoffs[]` | Handoff 檔案路徑陣列 | AI Agent |

### default-sdlc.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `workflow` | workflow ID（`default-sdlc`） | AI Agent |
| `display_name` | 工作流顯示名稱 | 使用者 + AI Agent |
| `stages[]` | 階段定義陣列 | AI Agent |
| `stages[].id` | 階段代碼（`requirement`, `system-design`...） | AI Agent |
| `stages[].name` | 階段名稱 | 使用者 + AI Agent |
| `stages[].owner` | 階段責任角色（`ba/sa/dev/qa`） | AI Agent |
| `stages[].inputs` | 進入此階段所需 artifact 類型 | AI Agent |
| `stages[].outputs` | 此階段輸出 artifact 類型 | AI Agent |
| `stages[].next` | 下一階段 ID 清單 | AI Agent |
| `handoff_rules[]` | 角色交接規則 | AI Agent |
| `handoff_rules[].from/to` | 交接角色方向 | AI Agent |
| `handoff_rules[].required_artifacts` | 交接必備 artifact 類型 | AI Agent |
| `handoff_rules[].required_state` | 交接時要求狀態（如 `approved`） | AI Agent |

### ba.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `role` | 角色代碼（`ba`） | AI Agent |
| `display_name` | 角色名稱（Business Analyst） | 使用者 + AI Agent |
| `can_create` | BA 可建立類型（`srs`, `user-story`, `acceptance-criteria`, `handoff-package`） | AI Agent |
| `can_read` | BA 可讀類型 | AI Agent |
| `can_update` | BA 可更新類型 | AI Agent |
| `default_templates` | artifact type 對應模板檔名 | AI Agent |
| `handoff_targets` | BA 可交接目標（`sa`） | AI Agent |
| `package_policy.include/exclude` | 建立 context package 時納入/排除規則 | AI Agent |

### sa.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `role` | 角色代碼（`sa`） | AI Agent |
| `display_name` | 角色名稱（System Architect） | 使用者 + AI Agent |
| `can_create` | SA 可建立類型（`sdd`, `adr`, `api-design`, `handoff-package`） | AI Agent |
| `can_read` | SA 可讀類型（含 BA/SA 產物） | AI Agent |
| `can_update` | SA 可更新類型 | AI Agent |
| `default_templates` | SA 類型對應模板 | AI Agent |
| `handoff_targets` | SA 交接目標（`dev`, `qa`） | AI Agent |
| `package_policy.include/exclude` | SA context package 納入/排除規則 | AI Agent |

### dev.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `role` | 角色代碼（`dev`） | AI Agent |
| `display_name` | 角色名稱（Developer） | 使用者 + AI Agent |
| `can_create` | DEV 可建立類型（`implementation-note`, `unit-test-note`, `code-review-note`, `handoff-package`） | AI Agent |
| `can_read` | DEV 可讀類型 | AI Agent |
| `can_update` | DEV 可更新類型 | AI Agent |
| `default_templates` | DEV 類型對應模板 | AI Agent |
| `handoff_targets` | DEV 交接目標（`qa`） | AI Agent |
| `package_policy.include/exclude` | DEV context package 納入/排除規則 | AI Agent |

### qa.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `role` | 角色代碼（`qa`） | AI Agent |
| `display_name` | 角色名稱（QA Tester） | 使用者 + AI Agent |
| `can_create` | QA 可建立類型（`test-plan`, `test-case`, `defect-report`, `qa-signoff`） | AI Agent |
| `can_read` | QA 可讀類型 | AI Agent |
| `can_update` | QA 可更新類型 | AI Agent |
| `default_templates` | QA 類型對應模板 | AI Agent |
| `handoff_targets` | QA 交接目標（`dev`, `sa`） | AI Agent |
| `package_policy.include/exclude` | QA context package 納入/排除規則 | AI Agent |

### srs.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | `type`, `display_name`, `template`, `id_prefix`, `default_owner`, `aliases`, `required_fields`, `allowed_roles` | AI Agent |
| 本檔定義值 | `type=srs`, `template=srs.md`, `id_prefix=SRS`, `default_owner=ba`, `required_fields=[task_id,title]` | AI Agent |
| `allowed_roles` | `create/update=ba`, `read=ba,sa,dev,qa` | AI Agent |

### user-story.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=user-story`, `template=user-story.md`, `id_prefix=US`, `default_owner=ba` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,title]`；`create/update=ba`；`read=ba,sa,dev,qa` | AI Agent |

### acceptance-criteria.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=acceptance-criteria`, `template=acceptance-criteria.md`, `id_prefix=AC`, `default_owner=ba` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,title]`；`create/update=ba`；`read=ba,sa,dev,qa` | AI Agent |

### sdd.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=sdd`, `template=sdd.md`, `id_prefix=SDD`, `default_owner=sa` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,title]`；`create/update=sa`；`read=ba,sa,dev,qa` | AI Agent |

### adr.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=adr`, `template=adr.md`, `id_prefix=ADR`, `default_owner=sa` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[decision,context,consequences]`；`create/update=sa`；`read=sa,dev,qa` | AI Agent |

### api-design.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=api-design`, `template=api-design.md`, `id_prefix=API`, `default_owner=sa`, `aliases=[api]` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,title]`；`create/update=sa`；`read=sa,dev,qa` | AI Agent |

### implementation-note.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=implementation-note`, `template=implementation-note.md`, `id_prefix=IMPL`, `default_owner=dev` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,changed_files]`；`create/update=dev`；`read=sa,dev,qa` | AI Agent |

### unit-test-note.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=unit-test-note`, `template=unit-test-note.md`, `id_prefix=UNIT`, `default_owner=dev` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,unit_tests]`；`create/update=dev`；`read=dev,qa` | AI Agent |

### code-review-note.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=code-review-note`, `template=code-review-note.md`, `id_prefix=CR`, `default_owner=dev` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,review_summary]`；`create/update=dev`；`read=dev,qa` | AI Agent |

### test-plan.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=test-plan`, `template=test-plan.md`, `id_prefix=TEST`, `default_owner=qa`, `aliases=[test]` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,test_scope]`；`create/update=qa`；`read=sa,dev,qa` | AI Agent |

### test-case.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=test-case`, `template=test-case.md`, `id_prefix=TC`, `default_owner=qa` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,test_steps]`；`create/update=qa`；`read=dev,qa` | AI Agent |

### defect-report.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=defect-report`, `template=defect-report.md`, `id_prefix=BUG`, `default_owner=qa` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,actual_result]`；`create/update=qa`；`read=dev,qa` | AI Agent |

### qa-signoff.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=qa-signoff`, `template=qa-signoff.md`, `id_prefix=QA`, `default_owner=qa` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,signoff_state]`；`create/update=qa`；`read=sa,dev,qa` | AI Agent |

### release-readiness-report.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=release-readiness-report`, `template=release-readiness-report.md`, `id_prefix=REL`, `default_owner=sa` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id,release_decision]`；`create/update=sa`；`read=sa,dev,qa` | AI Agent |

### handoff-package.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=handoff-package`, `template=implementation-note.md`, `id_prefix=HO`, `default_owner=system` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id]`；`create/update=ba,sa,dev`；`read=ba,sa,dev,qa` | AI Agent |

### context-package.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| 共用欄位 | 同 artifact-type 共用定義 | AI Agent |
| 本檔定義值 | `type=context-package`, `template=implementation-note.md`, `id_prefix=CTX`, `default_owner=system` | AI Agent |
| `required_fields`/`allowed_roles` | `required_fields=[task_id]`；`create=[]`；`update=[]`；`read=ba,sa,dev,qa` | AI Agent |

### srs.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter 欄位 | `id`, `type`, `task_id`, `title`, `owner`, `status`, `version`, `approval_status`, `last_updated`, `source_refs`, `depends_on`, `outputs` | AI Agent |
| Placeholder | 使用 `{{ARTIFACT_ID}}`, `{{TYPE}}`, `{{TASK_ID}}`, `{{TITLE}}`, `{{OWNER}}`, `{{DATE}}` 進行替換 | AI Agent |
| 文件章節 | `# {{TITLE}}`、`## Software Requirements Specification`、`## Source References` | 使用者 + AI Agent |

### user-story.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter 欄位 | 同 `srs.md` 通用欄位 | AI Agent |
| Placeholder | 同通用模板 placeholder | AI Agent |
| 文件章節 | `## User Story`、`## Source References` | 使用者 + AI Agent |

### acceptance-criteria.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter 欄位 | 同 `srs.md` 通用欄位 | AI Agent |
| Placeholder | 同通用模板 placeholder | AI Agent |
| 文件章節 | `## Acceptance Criteria`、`## Source References` | 使用者 + AI Agent |

### sdd.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter 欄位 | 同 `srs.md` 通用欄位 | AI Agent |
| Placeholder | 同通用模板 placeholder | AI Agent |
| 文件章節 | `## System Design Document`、`## Source References` | 使用者 + AI Agent |

### adr.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter 欄位 | 同 `srs.md` 通用欄位 | AI Agent |
| Placeholder | 同通用模板 placeholder | AI Agent |
| 文件章節 | `## Architecture Decision Record`、`## Source References` | 使用者 + AI Agent |

### api-design.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter 欄位 | 同 `srs.md` 通用欄位 | AI Agent |
| Placeholder | 同通用模板 placeholder | AI Agent |
| 文件章節 | `## API Design`、`## Source References` | 使用者 + AI Agent |

### implementation-note.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter 欄位 | 同 `srs.md` 通用欄位 | AI Agent |
| Placeholder | 同通用模板 placeholder | AI Agent |
| 文件章節 | `## Implementation Note`、`## Source References` | 使用者 + AI Agent |

### unit-test-note.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter 欄位 | 同 `srs.md` 通用欄位 | AI Agent |
| Placeholder | 同通用模板 placeholder | AI Agent |
| 文件章節 | `## Unit Test Note`、`## Source References` | 使用者 + AI Agent |

### code-review-note.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter 欄位 | 同 `srs.md` 通用欄位 | AI Agent |
| Placeholder | 同通用模板 placeholder | AI Agent |
| 文件章節 | `## Code Review Note`、`## Source References` | 使用者 + AI Agent |

### test-plan.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter 欄位 | 同 `srs.md` 通用欄位 | AI Agent |
| Placeholder | 同通用模板 placeholder | AI Agent |
| 文件章節 | `## Test Plan`、`## Source References` | 使用者 + AI Agent |

### test-case.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter 欄位 | 同 `srs.md` 通用欄位 | AI Agent |
| Placeholder | 同通用模板 placeholder | AI Agent |
| 文件章節 | `## Test Case`、`## Source References` | 使用者 + AI Agent |

### defect-report.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter 欄位 | 同 `srs.md` 通用欄位 | AI Agent |
| Placeholder | 同通用模板 placeholder | AI Agent |
| 文件章節 | `## Defect Report`、`## Source References` | 使用者 + AI Agent |

### qa-signoff.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter 欄位 | 同 `srs.md` 通用欄位 | AI Agent |
| Placeholder | 同通用模板 placeholder | AI Agent |
| 文件章節 | `## QA Signoff`、`## Source References` | 使用者 + AI Agent |

### release-readiness-report.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter 欄位 | 同 `srs.md` 通用欄位 | AI Agent |
| Placeholder | 同通用模板 placeholder | AI Agent |
| 文件章節 | `## Release Readiness Report`、`## Source References` | 使用者 + AI Agent |

### acs.schema.json

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `$schema`, `$id`, `title`, `type` | Schema 基礎識別資訊 | AI Agent |
| `required` | 根層強制欄位：`version`, `project`, `store`, `roles`, `artifact_types`, `naming` | AI Agent |
| `properties.project` | 要求 `default_workflow` | AI Agent |
| `properties.store` | 定義 `mode`（`in-repo/local/dedicated`）與 `project_path` | AI Agent |
| `properties.roles` | 角色清單（最少 1） | AI Agent |
| `properties.artifact_types` | artifact type 清單（最少 1） | AI Agent |
| `properties.naming` | 要求 `artifact_path`, `handoff_path`, `package_path`；新版預設 `artifact_path` 為 `artifacts/{task_id}/{type}/{artifact_id}.{ext}` | AI Agent |

### artifact.schema.json

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `$schema`, `$id`, `title`, `type` | Schema 基礎識別資訊 | AI Agent |
| `required` | Artifact metadata 必填：`id`, `type`, `title`, `owner`, `status`, `version`, `approval_status`, `last_updated`, `source_refs` | AI Agent |
| `status` enum | `draft`, `ready_for_review`, `changes_requested`, `approved`, `deprecated`, `superseded` | AI Agent |
| `approval_status` enum | `pending`, `approved`, `changes_requested`, `deprecated`, `superseded` | AI Agent |
| `depends_on`, `outputs` | 依賴與輸出列表（可選） | AI Agent |

### artifact-type.schema.json

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `required` | `type`, `display_name`, `template`, `id_prefix`, `default_owner`, `required_fields`, `allowed_roles` | AI Agent |
| `allowed_roles` | 強制包含 `create`, `update`, `read` 三組權限陣列 | AI Agent |
| `aliases`/`schema`/`path_template` | 類型別名與額外規範延伸 | AI Agent |
| `additionalProperties: false` | 禁止未定義欄位，確保 artifact-type 文件一致性 | AI Agent |

### role.schema.json

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `required` | `role`, `display_name`, `can_create`, `can_read`, `can_update`, `handoff_targets`, `package_policy` | AI Agent |
| `default_templates` | 各 artifact 類型預設模板映射 | AI Agent |
| `package_policy.include/exclude` | context package 納入/排除規則 | AI Agent |
| `additionalProperties: false` | 限制 role 配置欄位，避免漂移 | AI Agent |

### workflow.schema.json

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `required` | `workflow`, `display_name`, `stages`, `handoff_rules` | AI Agent |
| `stages[]` | 階段物件必填：`id`, `name`, `owner`, `inputs`, `outputs`, `next` | AI Agent |
| `handoff_rules[]` | 規則物件必填：`from`, `to`, `required_artifacts`, `required_state` | AI Agent |
| `additionalProperties: false` | 嚴格限制 workflow 文件格式 | AI Agent |

### handoff.schema.json

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `$schema` | JSON Schema 版本宣告 | AI Agent |
| `type` | 目前僅要求物件型別 | AI Agent |
| `additionalProperties: true` | 目前為寬鬆 schema，允許任意欄位 | AI Agent |

### context-package.schema.json

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `$schema` | JSON Schema 版本宣告 | AI Agent |
| `type` | 目前僅要求物件型別 | AI Agent |
| `additionalProperties: true` | 目前為寬鬆 schema，允許任意欄位 | AI Agent |

### context-summary.schema.json

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `$schema` | JSON Schema 版本宣告 | AI Agent |
| `type` | 目前僅要求物件型別 | AI Agent |
| `additionalProperties: true` | 目前為寬鬆 schema，允許任意欄位 | AI Agent |

### approval.schema.json

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `$schema` | JSON Schema 版本宣告 | AI Agent |
| `type` | 目前僅要求物件型別 | AI Agent |
| `additionalProperties: true` | 目前為寬鬆 schema，允許任意欄位 | AI Agent |

### definition-of-ready.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `# Definition of Ready` | 文件標題 | 使用者 |
| 檢核條列 | 要求欄位完整、ID 穩定、來源引用、開放問題可追蹤 | 使用者、AI Agent |

### definition-of-done.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `# Definition of Done` | 文件標題 | 使用者 |
| 檢核條列 | 要求 artifact 驗證、handoff package 存在、可產生下一角色 context package | 使用者、AI Agent |

### approval-state-rules.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `# Approval State Rules` | 文件標題 | 使用者 |
| `Valid states` | 定義合法狀態：`draft`, `ready_for_review`, `changes_requested`, `approved`, `deprecated`, `superseded` | 使用者 + AI Agent |

### source-reference-rules.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `# Source Reference Rules` | 文件標題 | 使用者 |
| 引用優先規則 | 優先使用已批准 artifact、issue、commit、PR、meeting notes，高於 chat history | 使用者 + AI Agent |

### HOFF-DEMO-0001-BA-SA.yaml

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `id` | Handoff ID | 使用者 + AI Agent |
| `task_id` | 任務 ID（`DEMO-0001`） | 使用者 + AI Agent |
| `from_role` / `to_role` | 交接角色方向（BA → SA） | 使用者 + AI Agent |
| `handoff_type` | 交接類型（`role_handoff`） | AI Agent |
| `status` | 交接當前狀態（`ready_for_review`） | 使用者 + AI Agent |
| `approval_status` | 審核狀態（`pending`） | 使用者 + AI Agent |
| `artifacts.required[]` | 必要 artifact 路徑、類型、版本、摘要 | 使用者 + AI Agent |
| `context_summary` | 本次交接摘要 | 使用者 + AI Agent |
| `open_questions[]` | 尚待釐清問題清單 | 使用者 + AI Agent |
| `readiness.dor_status` / `blocking_questions` | Ready 程度與阻塞問題 | 使用者 + AI Agent |

### SRS-DEMO-0001.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter | `id`, `type`, `task_id`, `title`, `owner`, `status`, `version`, `approval_status`, `last_updated`, `source_refs`, `depends_on`, `outputs` | AI Agent |
| `## 1. Background` | 問題背景（登入頁移除 account input） | 使用者 + AI Agent |
| `## 2. Business Goal` | 商業目標（降低登入摩擦） | 使用者 + AI Agent |
| `## 3. Scope` | In Scope/Out of Scope | 使用者 + AI Agent |
| `## 4. Functional Requirements` | FR-001~FR-007 功能需求表 | 使用者 + AI Agent |
| `## 5. Non-Functional Requirements` | 安全性、相容性、可用性等非功能需求 | 使用者 + AI Agent |
| `## 6. Acceptance Criteria` | 可驗收條件描述 | 使用者 + AI Agent |
| `## 7. Open Questions` | 待 SA/DEV 釐清議題 | 使用者 + AI Agent |
| `## 8. Validation Checklist` | 文件完整性檢核勾選 | 使用者 + AI Agent |
| `## Source References` | 需求來源引用清單 | 使用者 + AI Agent |

### US-DEMO-0001.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter | 同 artifact 共用 metadata 欄位 | AI Agent |
| `## Primary Story` | As a / I want / so that 主敘事 | 使用者 + AI Agent |
| `## Business Value` | 業務價值說明 | 使用者 + AI Agent |
| `## User Journey` | 使用流程步驟 | 使用者 + AI Agent |
| `## Edge Cases` | 邊界條件 | 使用者 + AI Agent |
| `## Open Questions` | 待釐清議題 | 使用者 + AI Agent |
| `## Validation Checklist` | 文件品質檢核 | 使用者 + AI Agent |
| `## Source References` | 來源引用 | 使用者 + AI Agent |

### AC-DEMO-0001.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter | 同 artifact 共用 metadata 欄位 | AI Agent |
| `Scenario AC-001 ~ AC-006` | 驗收情境（顯示、送出、驗證、失敗行為、context 來源、版面） | 使用者 + AI Agent |
| `## Out of Scope For Acceptance` | 驗收不涵蓋範圍 | 使用者 + AI Agent |
| `## Validation Checklist` | 驗收條件文件品質檢核 | 使用者 + AI Agent |
| `## Source References` | 來源引用 | 使用者 + AI Agent |

### SDD-DEMO-0001.md

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| Front matter | 同 artifact 共用 metadata 欄位（含多個 `source_refs`） | AI Agent |
| `## 1. Purpose` | 設計目的與範圍 | 使用者 + AI Agent |
| `## 2. Current State` | 前端/後端現況分析 | 使用者 + AI Agent |
| `## 3. Design Decisions` | context 來源、API 契約、UI 命名、文件更新策略 | 使用者 + AI Agent |
| `## 4. Component Impact` | 元件衝擊表與 DEV 行動 | 使用者 + AI Agent |
| `## 5. Sequence` | Mermaid 時序圖 | 使用者 + AI Agent |
| `## 6. Acceptance Mapping` | FR 對映設計覆蓋度 | 使用者 + AI Agent |
| `## 7. Risks and Mitigations` | 風險與緩解措施 | 使用者 + AI Agent |
| `## 8. Test Strategy` | 測試策略（自動與手動） | 使用者 + AI Agent |
| `## 9. Open Questions` | 開放議題 | 使用者 + AI Agent |
| `## 10. Validation Checklist` | 文件檢核清單 | 使用者 + AI Agent |
| `## Source References` | 設計依據引用清單 | 使用者 + AI Agent |

### sa.context.md（`packages/DEMO-0001`）

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `# Context Package: DEMO-0001 / sa` | context package 標題 | AI Agent |
| `## Manifest` | 內含 JSON manifest | AI Agent |
| `manifest.task_id` / `role` / `generated_at` | 套件目標任務、角色、生成時間 | AI Agent |
| `manifest.included_artifacts[]` | 納入 artifact 清單（`path`, `type`, `version`） | AI Agent |
| `manifest.included_handoffs[]` | 納入 handoff 清單 | AI Agent |
| `manifest.excluded_artifacts[]` | 排除 artifact 清單（本檔為空） | AI Agent |
| `## Included/Excluded Artifacts` | 人類可讀列表 | 使用者 + AI Agent |
| `## Included Handoffs` | 人類可讀 handoff 列表 | 使用者 + AI Agent |

### sa.context.md（`packages/DEOM-0001`）

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `# Context Package: DEOM-0001 / sa` | context package 標題（任務 ID 為 `DEOM-0001`） | AI Agent |
| `## Manifest` | 內含 JSON manifest | AI Agent |
| `manifest.task_id` / `role` / `generated_at` | 套件識別資訊 | AI Agent |
| `manifest.included_artifacts[]` | 本檔為空陣列（沒有納入 artifact） | AI Agent |
| `manifest.included_handoffs[]` | 本檔為空陣列（沒有納入 handoff） | AI Agent |
| `manifest.excluded_artifacts[]` | 本檔為空陣列 | AI Agent |
| 各列表章節 | 均存在但內容為空，代表可產生空 context package | 使用者 + AI Agent |

### 2026-05-08.log

| 欄位/屬性 | 用途說明 | 主要使用者 |
| --- | --- | --- |
| `timestamp`（每行開頭） | 事件發生時間（ISO 格式） | 使用者、AI Agent |
| `action`（文字動詞） | 事件類型，如 `created artifact`, `created handoff`, `built context package`, `rebuilt index` | 使用者、AI Agent |
| `target`（路徑） | 受影響檔案路徑 | 使用者、AI Agent |
| 每行事件記錄 | 形成 append-only 稽核軌跡，便於追溯誰在何時產生何檔案 | 使用者 |

---

## 補充說明

1. 目前 `schemas/handoff.schema.json`、`schemas/context-package.schema.json`、`schemas/context-summary.schema.json`、`schemas/approval.schema.json` 採寬鬆定義（`additionalProperties: true`），實務上主要由流程規則與模板約束內容。
2. `packages/DEOM-0001/sa.context.md` 與 `packages/DEMO-0001/sa.context.md` 並存，顯示任務 ID 可能有 typo（`DEOM` vs `DEMO`）；若要避免混淆，建議在流程上加任務 ID 格式檢核。
3. 本說明已涵蓋 ACS 內容檔案；不包含 Git 版本控制內部檔案。
