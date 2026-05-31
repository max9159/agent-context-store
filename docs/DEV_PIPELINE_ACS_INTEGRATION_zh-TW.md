# dev-pipeline × ACS 整合分析與初步設計（zh-TW）

> 狀態:**初步設計（draft）**，尚未動任何 production code。
> 範圍:把個人專案的編排流程 `dev-pipeline.js` 與 Agent Context Store（ACS）整合,解決「狀態進度可查詢、交付記錄、文件持久化」三個痛點。
> 對象檔案:
> - 編排層:`/Users/Shared/dev/ai-agent/iclawagent/.claude/workflows/dev-pipeline.js`
> - 狀態/產物層:`acs` 0.2.14（本機已安裝;iclawagent 與 agent-context-store 兩個 repo 目前都**還沒有** `.acs` store）

---

## 0. 一句話結論

dev-pipeline 與 ACS **互補、可分層疊加,不是二選一**:

- **dev-pipeline = 編排/自動化層**(spawn agent、跑 gate、loop)。
- **ACS = 狀態/產物層**(durable、可查詢、跨 session)。

而你的核心痛點——「現在 system design 是在 review 階段還是還在設計階段?」——正是 dev-pipeline 現在**答不出來**、而 ACS **天生就能答**的問題。

---

## 1. 為什麼 dev-pipeline 現在答不出「在哪個階段」

`dev-pipeline.js` 裡所有的 phase / state 都是**單次 run 內的 JS 變數**:`designReady`、`collectedDecisions`、`baselineFailures`、loop 的 `round`。run 一結束就沒了。它沒有任何持久、可查詢的狀態欄位。

| 現象 | 證據（dev-pipeline.js） |
|---|---|
| 設計過了沒,只能翻 run journal 或重放整個 run | 整個 Design loop（L107–235）狀態只活在 `designReady` / `collectedDecisions` |
| 跨 run 銜接靠 cache-bust hack | `docVersion`（L91、L147–152）embedded 進 prompt 來手動 cache-bust |
| 跳過設計靠手動旗標 | `skipDesign`（L90、L112–113） |
| 唯一持久產物是單一 handoff doc | `docs/agent-handoffs/<slug>-system-development.md`（L104），裡面**沒有**結構化 status 欄位 |

L90–91、L147–152 那一整片 P0/P1/P2 fix 註解,本質上都在跟「狀態不持久」這件事搏鬥。

---

## 2. ACS 怎麼解這個問題

`acs init` 產生的 `.acs/` 裡,**幾乎每個行為都是檔案**(config-driven):

```text
.acs/
├─ config.yaml              # store 層設定（目前僅 version/toolkit/cli/mode）
├─ index.json
├─ acs.yaml                 # mode: in-repo
├─ workflows/
│  └─ default-sdlc.yaml     # 整條狀態機 + 關卡（handoff_rules 帶 required_state）
├─ roles/{ba,sa,dev,qa}.yaml# 每個角色能 create/read/update 哪些 artifact
├─ docs/
│  ├─ approval-state-rules.md   # 合法狀態語彙
│  ├─ definition-of-ready.md
│  └─ definition-of-done.md
├─ artifact-types/*.yaml    # 每種 artifact 的 schema/owner/權限
├─ templates/*.md
└─ schemas/*.json
```

合法狀態語彙(來自 `.acs/docs/approval-state-rules.md`):

```
draft → ready_for_review → changes_requested → approved → deprecated → superseded
```

於是「phase」變成一個 CLI 查詢就能回答的事實,而不是要重放一次 workflow 才推得出來:

```bash
acs status
acs log --task <slug>
acs next --role sa --task <slug>
```

---

## 3. 角色對照(已用實際 artifact-types 修正)

> ⚠️ 修正前一版評估的最大誤判:`code-review-note` **是存在的 artifact**,所以 senior-reviewer 對得到 ACS,落差其實很小。

實際 artifact-types(節錄):

```yaml
# code-review-note.yaml
type: code-review-note   # id_prefix: CR, default_owner: dev, read: [dev, qa]
# qa-signoff.yaml
type: qa-signoff         # id_prefix: QA, default_owner: qa, required: [task_id, signoff_state]
```

| dev-pipeline agent | ACS artifact / 狀態 | 對得上嗎 |
|---|---|---|
| system-analytics | SA 寫 `sdd` / `adr` / `api-design` | ✅ 很乾淨 |
| design-reviewer（Ready gate） | 把 SA artifact 翻成 `status: approved` | ✅ 關卡 = `sa→dev required_state: approved` |
| design 的 `decisions[]`（DESIGN_REVIEW_SCHEMA L21–24） | `adr` | ✅ 對得非常好 |
| developer | `implementation-note` / `unit-test-note` | ✅ |
| senior-reviewer（看 diff） | **`code-review-note`** + Pass → `qa-signoff.signoff_state` | ✅ 不用硬塞進 test-plan |

整條 dev-pipeline 幾乎就是 `default-sdlc.yaml` 那條狀態機的一個子集再實作一遍。

`default-sdlc.yaml` 的關卡(節錄 `handoff_rules`):

```yaml
- from: sa
  to: dev
  required_artifacts: [srs, sdd, adr, api-design]
  required_state: approved          # ← design 必須 approved 才能進 dev
- from: dev
  to: qa
  required_artifacts: [implementation-note, unit-test-note]
  required_state: ready_for_review
- from: system
  to: <any role>
  required_state: any               # ← relaxed：可從任意角色中途進場
```

---

## 4. 名詞釐清:「ledger 模式」

關於一個 feature,其實有兩種資訊:

| | 內容（content） | 狀態（state） |
|---|---|---|
| 是什麼 | 設計推理、實作摘要、測試思路（大段散文） | 在哪個 phase、過了沒、有哪些決策、簽核了沒 |
| 適合的載體 | Markdown 文件（現在的 handoff doc） | 結構化欄位（`status` / `approval_status` / `signoff`） |

- **Ledger 模式**:ACS 只存「狀態」——每個 task 一筆很薄的記錄,帶 `status`、`decisions(ADR)`、`signoff`,外加一個**指回 handoff doc 的路徑**。散文留在 handoff doc。ACS 像這份 doc 上的可查詢帳本/索引(類比 `git log`),不取代 doc。
- **Full-artifacts 模式**(ACS 預設):ACS 連內容也存——SRS/SDD/ADR/impl-note/test-plan 各是完整文件;此時 handoff doc 多餘,應退役。

> 用 ACS 術語精準定義 ledger:`default-sdlc.yaml` 的關卡會要求 sdd/adr/impl-note 存在且狀態到位。**Ledger = 仍建這些 artifact(滿足關卡),但 body 寫薄(指回 handoff doc),只讓 frontmatter 的狀態是真的。** 這是「ledger」和 ACS artifact 模型之間的橋。

**為什麼 ledger 適合 solo**:不必把同一份內容維護在兩處(避免 drift)、ceremony 最低,但仍拿到真正想要的東西——「我在哪個 phase」變成一個 CLI 查詢。

---

## 5. Solo vs Team:拆成兩個獨立旋鈕

不要用一個籠統的 mode,拆成兩個正交旋鈕:

| 旋鈕 | Solo | Team |
|---|---|---|
| `collaboration`（approval 權限） | **agent 可自批**:design-reviewer 給 Ready 就翻 `approved`（沒有第二個人要等） | **人工簽核**:agent verdict 只是建議,由另一個人翻 bit;`approval_status` 在人簽前維持 pending |
| `artifacts`（內容深度） | `ledger`（handoff doc 為正本） | `full`（完整 artifact,可審計/可並行） |
| open-questions 關卡 | 仍為**你**暫停 | 為 product owner 暫停 |
| QA signoff | senior-reviewer Pass = 自動 signoff | 獨立 QA 人簽 |
| validate 嚴格度 | `relaxed`（常中途進場） | `strict`（強制上游 handoff） |

**關鍵洞察**:「approval 由誰翻」不必是獨立決定——它**塌縮進 `collaboration` 旋鈕**。Solo 的意義就是「reviewer agent 被授權當批准者,因為沒有第二個人要等」;Team 的意義是「agent verdict 是建議,人來翻 bit」。

注意:`workflow.yaml` 的 `required_state: approved` **兩種模式都不變**,變的只是「誰有權把狀態推到 approved」。

---

## 6. 每個設定該放哪一層(架構決定)

| 設定 | 放哪 | 理由 |
|---|---|---|
| `collaboration: solo\|team`、`artifacts: ledger\|full` | **`.acs/config.yaml`**（新增欄位） | 已有此檔;是 store 層政策,任何碰 store 的工具都該一致讀到 |
| 關卡定義（phase 要哪些 artifact + `required_state`） | `.acs/workflows/*.yaml` | 已是資料;solo 可給精簡 workflow（例如併掉 release-readiness） |
| 合法狀態語彙 | `.acs/docs/approval-state-rules.md` | 已存在,不用動 |
| **翻 `approved` 這個「動作」** | **dev-pipeline.js** | ACS validate 只看「狀態是不是 approved」,不看「是 agent 還是人翻的」。由 config 宣告政策,dev-pipeline 讀到 solo 就被授權 programmatically 翻 frontmatter |

效果:**政策有單一真相（config.yaml）**,**機制留在 agent 真正執行的編排層**,ACS core 幾乎不用改。

建議的 `.acs/config.yaml`(在現有內容上加):

```yaml
version: 1
toolkit: agent-context-store
cli: acs
mode: in-repo
# ── 新增 ──
collaboration: solo      # solo | team   → solo 允許 agent 自批
artifacts: ledger        # ledger | full → ledger 保留 handoff doc 為正本
workflow: default-sdlc   # solo 可換成精簡版
```

建議的 ledger 版「薄狀態記錄」雛形(每個 task 一筆,frontmatter 為真、body 指回 doc):

```yaml
---
task: <feature-slug>
phase: development            # design | development | done
status: approved             # draft | ready_for_review | changes_requested | approved
approval_status: approved    # pending | approved
approved_by: design-reviewer (auto, solo)
decisions: [ ... ]           # 即 ADR 清單
signoff: pending             # pending | passed（senior-reviewer Pass → passed）
handoff_doc: docs/agent-handoffs/<slug>-system-development.md
---
（內容見 handoff_doc）
```

---

## 7. 最大紅利:用 ACS 狀態取代 `docVersion` / `skipDesign` 的 hack

這是整合最值錢處,不只是「多一層記錄」。

dev-pipeline 現在 L90–91、L147–152 那組 P0 註解全在跟「狀態不持久」搏鬥:手動 bump `docVersion` 去 cache-bust、手動傳 `skipDesign` 跳設計。

整合後改成 **dev-pipeline 開頭讀一次 ACS 狀態**:

```text
讀 sdd.status
  == approved                  → 自動跳過 Design phase（等同 skipDesign，但不用人傳）
  == draft / ready_for_review  → 進 Design loop
讀 code-review-note / qa-signoff
  signoff == passed            → 已交付，直接到 Done
```

「現在在 review 還是還在設計?」= `acs status` / `acs log --task <slug>` 一個查詢就答得出,**不必重放整個 run**。resume 的手動旗標全部消失。

---

## 8. 整合深度三選一

| 方案 | 內容 | 取捨 |
|---|---|---|
| A. 完整採用 ACS | handoff doc → 拆成 SRS/SDD/ADR/impl-note/test-plan,每個 agent 呼叫 `acs` CLI | 最持久、最可審計;ceremony 最重,跟「Simplicity First」衝突 |
| **B. 薄狀態層（推薦）** | dev-pipeline 結構不動,只在 phase 邊界寫 ACS 狀態:Design 結束讓 Ready verdict 把 SDD 翻 `approved`、`decisions[]` 落成 ADR,其餘照舊 | 改動最小,正好解掉「phase 可查詢」,且不破壞現有 resume | 
| C. 不整合 | 維持現有 cache-resume + handoff doc | ACS 對此 repo 是淨增負擔 |

---

## 9. 整體建議

> **Solo profile = `{collaboration: solo, artifacts: ledger, workflow: 精簡}`;Team profile = `{collaboration: team, artifacts: full, workflow: default-sdlc}`。**
> 兩個旋鈕獨立,寫進 `.acs/config.yaml`;翻 `approved` 的動作留在 dev-pipeline 讀 config 後執行。
> 個人專案先跑 Solo,哪天要拉人進來改 config 即可,workflow 的關卡不用重寫。整合深度採 **方案 B**。

---

## 10. 待拍板的決定點

1. **整合深度**:A / B / C?(建議 B)
2. **approval 權限**:沿用自動 gate vs 保留人工簽核?(已塌縮進 `collaboration` 旋鈕)
3. **ACS core 要不要動**:
   - 若要讓 `acs validate` 真的依 mode 改變「agent 自批是否合法」→ 需動 ACS core。
   - 若維持「config 宣告、dev-pipeline 執行」→ core 不用動(推薦)。

---

## 11. 下一步可交付(皆為改文件、不寫 production code)

1. **兩個 ACS profile 的具體設定 diff** — `config.yaml` 新欄位 + 一條 solo 精簡 `workflow.yaml` + ledger 版薄 artifact 樣板。
2. **dev-pipeline.js 改動設計** — 開頭讀 ACS 狀態決定 skip/resume、phase 邊界回寫 `status` / `code-review-note` / `qa-signoff`、移除 `docVersion` / `skipDesign` 的銜接圖。

---

## 附錄:本文件的事實基礎與假設

**已驗證(本機實跑)**
- `acs 0.2.14` 已安裝;iclawagent 與 agent-context-store 兩 repo 皆無 `.acs` store。
- `dev-pipeline.js` 全文(狀態皆為 run 內變數、單一 handoff doc、resume 靠 `docVersion`/`skipDesign`)。
- `acs init` 產生的 `.acs/` 結構;`config.yaml`、`approval-state-rules.md`、`default-sdlc.yaml`、`code-review-note.yaml`、`qa-signoff.yaml`、`sdd.yaml`、`roles/{sa,dev}.yaml` 內容。

**假設 / 待確認**
- `.acs/config.yaml` 目前**沒有** `collaboration` / `artifacts` 欄位;本文的欄位為**提議新增**。
- 若要 `acs validate` 依 mode 改變批准合法性,需修改 ACS core(尚未評估改動點)。
- 進實作前,建議先 `acs init` 開一個真 store,跑 `acs doctor` / `acs validate` / `acs next` 確認 schema 真實行為,再動 workflow。
