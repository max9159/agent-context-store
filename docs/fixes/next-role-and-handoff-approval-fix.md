# 修復設計文件：suggestedNextRole 推導錯誤 與 handoff approve 缺口

- 狀態：已實作（2026-06-04）— 經三輪 design review 與兩輪 code review，pnpm build / pnpm test（242 tests）全綠
- 範圍：agent-context-store repo
- 對應問題：
  - Bug 1（真 bug）— suggestedNextRole 在同一 role 擁有多個 stage 時推導錯誤
  - Bug 2（缺陷 / gap）— handoff 永遠停在 pending，沒有核准用的 CLI 途徑
  - 現象 1（非 bug，需說明）— Kanban Review 由 pending handoff 驅動

---

## 1. 程式碼確認（已實際讀過原始碼）

主對話提供的分析經逐行核對，完全正確，補充細節如下。

### 1.1 預設 workflow stages（Bug 1 根因）

src/packages/core/src/index.ts:454-460，defaultPolicy.workflow.stages 定義：

- idx 0: requirement -> ba
- idx 1: system-design -> sa
- idx 2: development -> dev
- idx 3: qa-test -> qa
- idx 4: release-readiness -> sa

sa 同時擁有 idx 1 與 idx 4 兩個非連續的 stage，這是缺陷邏輯踩雷的前提。

### 1.2 兩處重複的 next-role 推導邏輯

完全相同的「找 owner 落在 ownerSet 的最後一個 stage」邏輯重複出現於：

- buildSiteModel：src/packages/core/src/index.ts:1541-1556（變數名 ownerSet / suggestedNextRole）
- getTasksOverview：src/packages/core/src/index.ts:2790-2806（變數名 owners / suggestedNextRole，外加 isEntry 旗標）

兩者邏輯一致（虛擬碼）：

    let lastIdx = -1;
    stages.forEach((stage, idx) => { if (ownerSet.has(stage.owner)) lastIdx = idx; });
    if (lastIdx >= 0 && lastIdx + 1 < stages.length) suggestedNextRole = stages[lastIdx + 1].owner;
    else if (lastIdx >= 0) suggestedNextRole = stages[lastIdx].owner;

缺陷推演：當某 task 的 artifacts owner 為 {ba, sa} 時，forEach 會把 lastIdx 一路推進到 idx 4（因 sa 擁有 idx 4）。idx 4 是最後一個 stage，lastIdx + 1 已超界，因此進入 else 分支回傳 stages[4].owner = sa。

- 實際回傳：sa
- 正確答案：dev（idx 2，第一個 owner 不在 {ba, sa} 內的後續 stage）
- 後果：dev、qa 兩個 stage 被整段跳過。

影響面確認：因兩處都錯，不只 acs site build 產生的網站，連 acs status / tasks overview（getTasksOverview 於 CLI 的 status 流程被呼叫）也回報相同的錯誤 next role。

### 1.3 handoff CLI action 分派（Bug 2 根因）

- 建立 handoff 時，stringifyHandoff（src/packages/core/src/index.ts:2581-2616）寫死兩個欄位：status: ready_for_review（第 2603 行）與 approval_status: pending（第 2604 行）。
- handleHandoff（src/packages/cli/src/index.ts:571-624）只分派 create / check / list，最後 fallthrough 丟出 Unknown handoff action. Expected "create", "check", or "list".（第 623 行，各動詞皆雙引號）。
- 沒有任何 approve / accept 動作，core 也沒有對應的 approveHandoff 匯出函式。
- 結論：handoff 一旦建立就永久停在 approval_status: pending，無 CLI 途徑可改。

### 1.4 schema 允許的合法值（核准目標值依據）

- src/assets/schemas/handoff.schema.json：approval_status 與 status 只宣告為 type: string（未列舉 enum），且 additionalProperties: true。故就 handoff schema 本身而言，寫入 approved 一定合法。
- src/assets/schemas/approval.schema.json 為審批狀態的權威列舉：status 屬於 draft, ready_for_review, changes_requested, approved, deprecated, superseded；approval_status 屬於 pending, approved, changes_requested, deprecated, superseded。
- docs/approval-state-rules.md（由 init 於 src/packages/core/src/index.ts:710 寫入）載明同一組合法值。
- 因此核准的目標值為 approval_status: approved，並應同步把 status 由 ready_for_review 升為 approved，以符合 approval.schema.json 的語意。
- 釐清（findings 修正）：validateContextStore（src/packages/core/src/index.ts:984-985）那條「approval_status 為 approved 但 status 不是 approved」的警告，是在 **artifact .md frontmatter** 驗證迴圈內觸發（metadata 來自 parseFrontmatter，artifacts 於 :987-996 收集），handoff YAML 迴圈另起於 :999，不經過該檢查。故此警告對 handoff **永遠不會**觸發，不能當作同步 status 的理由。同步 status 仍應做，但理由僅為符合 approval.schema.json 的語意一致性。

### 1.5 deriveKanbanState（現象 1，非 bug）

deriveKanbanState（src/packages/core/src/index.ts:1415-1443）依優先序：Blocked -> Done -> Review -> 角色 stage -> Entry。其中第 1430 行：只要 hasPendingHandoff 為真就回傳 Review，與 artifact 是否 approved 無關。hasPendingHandoff 在 buildSiteModel（第 1513-1515 行）由任一 handoff 的 approvalStatus 為 pending 或 pending_approval 推得。

此設計本身為 by-design（pending handoff = 待 review），但與 Bug 2 連動：因無核准途徑，handoff 永遠 pending，task 將永久卡在 Review。本文件不修改此行為，僅在非目標與邊界情況中說明；Bug 2 修好後此現象自然解除。

---

## 2. Bug 1 修復設計：統一且正確的 next-role 演算法

### 2.1 正確語意

下一個該動作的角色應為：依 stage 順序，第一個 owner 尚未有 artifacts（不在 ownerSet 內）的 stage 的 owner。這天然處理了同一 role 擁有多個非連續 stage 的情況，因為我們不再依賴最後一個命中的 stage。

邊界：
- ownerSet 為空 -> 入口情境，suggestedNextRole = any，isEntry = true。
- 所有 stage 的 owner 都已在 ownerSet 內（流程理論上走完）-> 沒有未完成 stage，回傳最後一個 stage 的 owner（維持現行卡在尾端的相容行為，例如 release-readiness 的 sa）。

### 2.2 共用 helper（消除兩處重複）

於 src/packages/core/src/index.ts 新增單一純函式（建議放在 getTasksOverview 上方、與 deriveKanbanState 相鄰的工具區）：

    /**
     * Compute the role that should act next for a task.
     * Semantics: owner of the first stage whose owner has NO artifacts yet.
     * Correctly handles a role owning multiple non-contiguous stages.
     */
    export function computeNextRole(
      ownerSet: ReadonlySet<string>,
      stages: ReadonlyArray<{ owner: string }>
    ): { suggestedNextRole: string; isEntry: boolean } {
      if (ownerSet.size === 0) {
        return { suggestedNextRole: "any", isEntry: true };
      }
      for (const stage of stages) {
        if (!ownerSet.has(stage.owner)) {
          return { suggestedNextRole: stage.owner, isEntry: false };
        }
      }
      const last = stages[stages.length - 1];
      return { suggestedNextRole: last?.owner ?? "ba", isEntry: false };
    }

驗證 Bug 1 案例：ownerSet = {ba, sa}，stages owner 序列 [ba, sa, dev, qa, sa]。
- idx 0 ba 在 set，跳過
- idx 1 sa 在 set，跳過
- idx 2 dev 不在 set -> 回傳 dev、isEntry=false（修正前回傳 sa）

其他既有案例回歸：
- {} -> any / entry
- {ba} -> sa
- {ba, sa, dev} -> qa
- {ba, sa, dev, qa} -> idx 0..3 命中、idx 4 sa 在 set -> 全部命中 -> 回傳尾端 sa（release-readiness）與現行尾端行為一致

### 2.3 兩處呼叫端改寫

- getTasksOverview（src/packages/core/src/index.ts:2790-2806）：移除內嵌迴圈，改為 const { suggestedNextRole, isEntry } = computeNextRole(owners, stages); 其餘 result.push(...) 不變。
- buildSiteModel（src/packages/core/src/index.ts:1541-1556）：移除內嵌迴圈，改為 const { suggestedNextRole } = computeNextRole(ownerSet, policy.workflow.stages);（buildSiteModel 不需要 isEntry，忽略即可。）

注意：ownerSet 的型別目前是 Set<string>，helper 參數以 ReadonlySet<string> 宣告以避免被改寫。

---

## 3. Bug 2 修復設計：acs handoff approve 子指令

### 3.1 使用者介面

新增 CLI 動作（沿用 create / check 既有的參數風格，兩種定位方式擇一）：

    acs handoff approve <HANDOFF_ID_OR_PATH> [--reviewer <NAME>] [--mode strict|relaxed]
    acs handoff approve --from <ROLE> --to <ROLE> --task <TASK_ID> [--reviewer <NAME>] [--mode strict|relaxed]

- 採用動詞 approve（語意比 accept 更貼近 approval_status）。定案：僅提供 approve，不做 accept 別名（審批詞彙在 approval.schema.json / docs 已統一為 approved，單一動詞名實相符且維護面最小）。
- 定位方式（與 checkHandoff 對齊）：位置參數 / --id 為 handoff id 或路徑，交給既有的 resolveHandoffPath；或 --from / --to / --task 用與 createHandoff 相同的命名規則組出 id HOFF-taskId-FROM-TO，再交給 resolveHandoffPath。
- reviewer 名字取得（三段式，不自動抓 git / OS 使用者）：(1) 首選 --reviewer 旗標；(2) 未給則讀環境變數 ACS_REVIEWER（與專案既有的 ACS_SESSION_ID 風格一致，便於 agent / CI 一次設定）；(3) 皆無則不寫 reviewer 行（留白，而非寫 unknown / 空字串）。不退回 git config user.name 或 OS USERNAME：專案無此先例、commit 作者未必等於核准者、OS 帳號多為雜訊。
- 分層職責（finding D 修正）：env fallback 只住在 CLI 層。比照既有 ACS_SESSION_ID（CLI 於 cli/index.ts:41-42 seeding、core 於 :2725 僅讀取），CLI 的 handleHandoff 負責 --reviewer ?? process.env.ACS_REVIEWER ?? undefined 的解析後傳入；core 的 approveHandoff **只認 options.reviewer**，不自行讀 process.env。故直接呼叫 core API 者需自帶 reviewer，與 ACS_REVIEWER 無關。

### 3.2 core 新增 API：approveHandoff

於 src/packages/core/src/index.ts 新增匯出函式，與 checkHandoff 放在一起：

    export interface ApproveHandoffOptions {
      rootDir: string;
      handoffRef?: string;   // id 或 path（與 --from/--to/--task 擇一）
      fromRole?: string;
      toRole?: string;
      taskId?: string;
      reviewer?: string;
      reviewedAt?: string;   // ISO 字串；省略時 core 預設 new Date().toISOString()（注入點，利於測試固定值）
      mode?: AcsMode;        // 預設 strict
    }

    export async function approveHandoff(
      options: ApproveHandoffOptions
    ): Promise<AcsResult & { handoffPath: string; handoffId: string; approvalStatus: "approved" }>;

行為流程：

1. resolveStoreContext(options.rootDir) 取得 storeDir / projectDir。注意 resolveStoreContext（src/packages/core/src/index.ts:505-534）本身不 loadPolicy；canonicalRole（:1634-1636）才需要 policy。故 loadPolicy 僅在走 --from/--to/--task 定位路徑（需 canonicalRole 正規化角色）時才必要，handoffRef 路徑可略過。
2. 解析 handoff 參考：若提供 handoffRef 直接用；否則需要 fromRole+toRole+taskId（缺則丟出明確錯誤），以 canonicalRole 正規化後組出 HOFF-taskId-FROM-TO。再以 resolveHandoffPath(storeDir, projectDir, ref) 定位，找不到則丟出 Handoff not found。
3. 讀檔 + 解析 + 冪等短路（必須在 strict 驗證之前）：以 parseYamlObject 取得目前 approval_status 與 task_id。若 approval_status 已是 approved 則視為 no-op，立即回傳（updated 為空、附 warning already approved），**不再進入 strict 驗證**——確保對已核准 handoff 重跑永不失敗（即使其引用的 artifact 之後遺失而會驗證失敗）。
4. strict 模式驗證（僅對尚未 approved 者）：呼叫既有 checkHandoff 的**位置參數多載** checkHandoff(rootDir, resolvedRef)（src/packages/core/src/index.ts:1153 字串多載，會做 schema + 引用 artifact 存在性的檔案層驗證）。切勿傳 options 物件——物件多載（:1154）會路由到 checkHandoffPolicy（:1665）做的是 policy 檢查，並非檔案驗證。strict 下若 validation.valid 為 false 則拒絕核准並回報 errors；relaxed 下驗證失敗只降級為 warnings，仍允許核准。
5. 改寫：把 approval_status: pending 改 approved、status: ready_for_review 改 approved，並寫入稽核欄位 reviewed_at（每次成功核准都寫）與 reviewer（僅在解析到名字時寫——見 §3.1 三段式取得；解析不到則不寫該行）。reviewed_at 的時間戳來源（finding A 修正）：core 目前**沒有**可重用的時鐘 / now helper（既有時間戳皆為 inline new Date().toISOString()，見 index.ts:1256/1390/1579/2727；today() 於 :2822-2824 亦寫死），故注入點必須**新增**——即 ApproveHandoffOptions.reviewedAt：呼叫端可傳固定 ISO 值供測試斷言，省略時 core fallback 為 new Date().toISOString()。此單一 reviewedAt 值同時用於 YAML 寫入與步驟 6 的 audit 事件，確保兩者一致（見 finding B）。寫回採用行導向的目標欄位取代，而非整份 YAML 重新序列化。理由更正（findings）：專案其實已依賴 yaml 套件（src/packages/core/src/index.ts:8 為 import { parse as parseYaml } from "yaml"，讀取走 parseYamlObject :2468 包裝；src/packages/core/package.json:45 列為相依，yaml.stringify 可用），故並非「無序列化器」；採行替換的真正理由是 handoff 由 stringifyHandoff 手刻產生，重新序列化會重排 / 重格式化 artifacts 與 readiness 巢狀區塊、破壞既有版面。建議封裝小工具 setYamlScalarLine(content, key, value)：approval_status / status 走「取代既有行」，reviewer / reviewed_at 走「缺鍵則附加新行」（見 §7 item 8）。
6. 寫 audit：appendAudit(storeDir, { action: handoff.approve, ts: reviewedAt, from, to, task_id, handoff, reviewer, reviewed_at: reviewedAt, mode })。AuditLogEvent（src/packages/core/src/index.ts:77-89）有 index signature（:88），故 reviewer / reviewed_at 可直接帶入。時間戳一致性（finding B 修正）：appendAudit 於 :2727 在 ts 省略時自動填 new Date().toISOString()，與 YAML 內注入的固定 reviewed_at 會飄移；故須**明確把步驟 5 的 reviewedAt 同時當作 audit 的 ts 並另存 reviewed_at 欄位**，使 YAML 與 audit 事件時間一致，§8 的固定時間戳測試才不會 flaky，timeline / acs log 也能看到 reviewed_at。task_id 一致性（findings）：appendAudit 只有在 event.task_id 為非空字串時才寫入 per-task tasks/<task_id>.jsonl（:2733）。走 handoffRef 路徑時 options 無 taskId，必須使用步驟 3 從 handoff YAML 解析出的 task_id（stringifyHandoff 於 :2599 寫入、handoff.schema.json 必填），否則 acs log --task 與網站 timeline 看不到核准事件。
7. 回傳 { ...emptyResult(), handoffPath, handoffId, approvalStatus: approved, updated: [resultPath] }。

### 3.3 CLI 接線

在 handleHandoff（src/packages/cli/src/index.ts:571）的 list 分支之後、fallthrough throw 之前加入 approve 分支：解析 mode / reviewer / from / to / task / 位置參數，呼叫 approveHandoff，再 printResult。reviewer 解析順序為 --reviewer 旗標 → 環境變數 ACS_REVIEWER → undefined（見 §3.1）。同時在 import 區（9-30）加入 approveHandoff；fallthrough 錯誤訊息更新為 Unknown handoff action. Expected "create", "check", "list", or "approve".（第 623 行，沿用既有各動詞雙引號樣式）；help 文字（785-799 區塊）新增一行 acs handoff approve 用法。

### 3.4 strict / relaxed 取捨

定案：採 strict 預設阻擋、relaxed 放行（沿用專案既有 strict/relaxed 心智模型）。

- strict（預設）：核准前必須通過 checkHandoff（schema 結構合法、引用的 artifacts 存在），驗證不過則拒絕核准（退出碼非 0），避免把不完整的交付標記為 approved。
- relaxed：驗證問題降為 warnings，允許人為強制核准；用於入口 / 例外流程，與專案既有 relaxed 語意一致。
- 注意：此驗證只作用於尚未 approved 的 handoff；已 approved 的冪等短路排在驗證之前（§3.2 步驟 3），故重跑已核准 handoff 永不被 strict 擋下。

---

## 4. 受影響檔案

- src/packages/core/src/index.ts：新增 computeNextRole helper；改寫 getTasksOverview（2790-2806）與 buildSiteModel（1541-1556）呼叫端；新增 approveHandoff API 與 ApproveHandoffOptions；新增 setYamlScalarLine 小工具；audit 事件新增欄位（reviewed_at 必寫、reviewer 視解析結果而定）。
- src/packages/cli/src/index.ts：import approveHandoff；handleHandoff 新增 approve 分支；更新 fallthrough 錯誤訊息；help 文字新增 approve 用法。
- src/test/core.spec.ts：新增 computeNextRole 與 approveHandoff 測試；補 getTasksOverview / buildSiteModel 的回歸測試。
- src/test/cli.spec.ts：新增 acs handoff approve 的 CLI 測試。
- docs/fixes/next-role-and-handoff-approval-fix.md：本文件（新增）。

無 schema / template 變更：handoff.schema.json 已允許 approved，approval.schema.json 已列舉合法值。src/assets/ 不需動，index.ts 內嵌 fallback 也不需同步（未新增 schema/template）。

---

## 5. Public API / CLI 影響

- 新增 CLI 動作 acs handoff approve（純新增，向後相容）。
- core 新增匯出 approveHandoff / ApproveHandoffOptions / computeNextRole（純新增）。
- getTasksOverview 與 buildSiteModel 的輸出值改變：對同一 role 擁有多個非連續 stage 的 task，suggestedNextRole 由錯誤的 sa 變為正確的 dev。此為修 bug 的預期行為差異，可能影響任何快照 / 字串比對測試，需一併更新。

---

## 6. Storage / 遷移影響

- Bug 1：純計算，不寫檔，無 storage 影響。
- Bug 2：approveHandoff 會就地修改既有 handoff YAML（兩個狀態欄位 + reviewed_at 必寫 + reviewer 視解析結果而定），並 append audit。不改變目錄結構、檔名或 schema 版本。
- 無需資料遷移：既有 pending handoff 只是尚未核准，執行 acs handoff approve 即可前進，不需批次轉換。

---

## 7. 邊界情況與失敗模式

1. 同一 role 多個非連續 stage（Bug 1 核心）：computeNextRole 已處理。
2. ownerSet 為空 -> any / entry。
3. 全部 stage owner 都已有 artifacts -> 回傳尾端 owner（沿用現行行為）。
4. approve 找不到 handoff -> 明確錯誤 Handoff not found。
5. approve 已是 approved -> no-op（warning，不重複寫檔 / audit），確保冪等。此短路必須排在 strict 驗證之前（見 §3.2 步驟 3），否則一個已 approved 但引用 artifact 之後遺失的 handoff，重跑會在 strict 驗證被拒，破壞冪等。
6. approve 缺定位參數（無 id 又無完整 from/to/task）-> 明確錯誤訊息。
7. strict 下 handoff 驗證失敗（僅對尚未 approved 者）-> 拒絕核准並回報 errors；relaxed -> 放行加 warnings。
8. YAML 行替換：須只取代頂層 approval_status: / status: 行，避免誤改 readiness.dor_status（src/packages/core/src/index.ts:2612，有縮排）等巢狀欄位。setYamlScalarLine 規格：以行首無縮排的 key: 錨定（^key:），值未加引號（stringifyHandoff 於 :2603-2604 輸出 status: ready_for_review / approval_status: pending 皆無引號），比對須容許值前後空白與選用引號，且只取代第一個命中。缺鍵情況須明確定義：approval_status / status 對既建 handoff 必存在；但選用的 reviewer / reviewed_at 可能不存在，setYamlScalarLine 在找不到鍵時應採「附加新行」而非靜默忽略。
9. 現象 1 連動：approve 後 hasPendingHandoff 變 false，Kanban 會離開 Review。離開後落點由 deriveKanbanState 的優先序決定（src/packages/core/src/index.ts:1415-1443）：Done 僅在 rolesWithArtifacts 含 qa 且 hasApprovedQaSignoff 時成立（:1425），否則落到對應角色 stage（roleOrder [qa, dev, sa, ba]，:1434-1440）或 Entry。以本文件 demo 的 ba->sa handoff 為例，approve 後不會直接 Done，而是落在角色 stage（如 SA）。deriveKanbanState 不需改動。

---

## 8. 測試計畫（plan-to-test 對應）

src/test/core.spec.ts（沿用既有 node:test + temp dir + isolatedEnv 模式）：

- computeNextRole 純函式單元測試：
  - {} -> { suggestedNextRole: any, isEntry: true }
  - {ba} -> sa；{ba, sa, dev} -> qa
  - 回歸 Bug 1：{ba, sa} 對預設 stages -> dev（而非 sa）
  - {ba, sa, dev, qa} -> 尾端 sa
- getTasksOverview：建立含 ba+sa artifacts 的 task，斷言 suggestedNextRole 為 dev（端到端回歸）。
- buildSiteModel：同上情境，斷言對應 siteTask.suggestedNextRole 為 dev。
- approveHandoff：
  - create -> approve（strict）後重讀 YAML，斷言 approval_status: approved 且 status: approved。
  - 以 --from/--to/--task 定位可成功。
  - 已 approved 再 approve 為冪等 no-op（無新增 updated）。
  - 不存在的 handoff -> throw。
  - audit：readTaskLog 含 action handoff.approve。
  - strict 下對驗證失敗的 handoff 拒絕核准；relaxed 放行。
  - （finding 1）strict 走檔案層驗證：建立一個引用不存在 artifact 的 handoff，strict approve 應被拒（確認呼叫的是 checkHandoff 位置參數多載而非 policy 多載）。
  - （finding 2）以 handoffRef（id/path）定位 approve 後，斷言 per-task log（readTaskLog(taskId)）非空且含 handoff.approve——驗證 task_id 確實從 YAML 解析並帶入 audit。
  - （finding 8）已 approved 且引用 artifact 已被刪除的 handoff，在 strict 下重跑 approve 仍為 no-op（不被驗證擋下），確認冪等短路排在 strict 驗證之前。
  - reviewer 取得：給 --reviewer 時 YAML 含對應 reviewer 行；未給 --reviewer 但設 ACS_REVIEWER 時取環境變數；兩者皆無時 YAML 不含 reviewer 行。
  - reviewed_at：以注入的固定 reviewedAt 斷言寫入值；確認 setYamlScalarLine 對缺鍵的 reviewer / reviewed_at 採附加新行、且不誤改 readiness.dor_status 等巢狀欄位。
  - （finding B）時間戳一致性：以固定 reviewedAt 注入後，斷言 handoff YAML 的 reviewed_at 與 per-task audit 事件的 ts / reviewed_at 三者相等（避免 appendAudit 自動填 ts 造成飄移）。

src/test/cli.spec.ts：

- acs handoff approve id 退出碼 0、輸出含 Approved handoff。
- acs handoff unknown 錯誤訊息含 approve。
- 可選：acs --help 含 handoff approve。

每個規劃行為皆有對應自動化測試，無例外。

---

## 9. 驗證指令

    pnpm build
    pnpm test
    pnpm test:integration
    pnpm smoke
    pnpm build && node --experimental-strip-types --test src/test/core.spec.ts
    pnpm build && node --experimental-strip-types --test src/test/cli.spec.ts
    git diff --check

手動驗收（在一個已 init 的 store）：

    acs handoff create --from ba --to sa --task DEMO-0001
    acs handoff approve HOFF-DEMO-0001-BA-SA --reviewer max
    acs log --task DEMO-0001
    acs site build

---

## 10. 非目標（Non-Goals）

- 不更動 deriveKanbanState 的 Review 規則（現象 1 為 by-design，Bug 2 修好後自然解除）。
- 不新增 reject / changes_requested 等其他審批動作（可作為後續 follow-up）。
- 不以 yaml.stringify 對整份 handoff 重新序列化（維持輕量行替換以保留手刻版面；註：專案已相依 yaml 套件，序列化器是可用的，此處為刻意取捨而非缺少工具）。
- 不調整預設 workflow stages 定義（sa 擁有兩個 stage 屬刻意設計）。
- 不變更 schema / template 檔案。

---

## 11. 已定案（原 Open Questions，已討論決議）

1. 動詞用 approve 還是同時提供 accept 別名？→ **定案：僅 approve，不做別名**。審批詞彙在 approval.schema.json / docs 已統一為 approved，單一動詞名實相符、維護面最小；日後若使用者常誤打，再加純別名屬向後相容的純新增。
2. approve 是否預設要求 strict 驗證通過？→ **定案：A — strict 預設阻擋、relaxed 放行**。沿用專案既有 strict/relaxed 語意，預設安全且保留 --mode relaxed 逃生門（細節見 §3.4）。
3. 是否要寫入 reviewer / reviewed_at？→ **定案：寫入**。reviewed_at 每次成功核准都寫（時間戳可注入以利測試）；reviewer 採三段式取得（--reviewer 旗標 → ACS_REVIEWER 環境變數 → 不寫該行），不自動抓 git / OS 使用者（細節見 §3.1）。對齊 approval.schema.json 的 reviewer 語意，schema 因 additionalProperties: true 一定合法。
