# Luné

手機優先的生理期記錄網頁 App：用最少的操作記錄經期、每日症狀與身體狀態，並從日曆和歷史資料了解自己的週期。一個帳號可以管理多個 Profile（例如自己、家人），每個 Profile 的資料完全分開。

> Luné 只協助記錄與估算，不提供醫療診斷；週期與預測都是估算，不能作為避孕依據。

規格文件：[`CycleNote-MVP.md`](CycleNote-MVP.md)（規格裡的產品名 CycleNote 已改為 Luné）。

## 進度

| Phase | 內容 | 狀態 |
| --- | --- | --- |
| 0 | repo、視覺提案（`design/`）、決策紀錄 | 完成：方案 A「霧藍星球」 |
| 1 | 專案骨架、資料層與 migration、登入註冊、版面與導覽 | 完成 |
| 2 | Profile 新增／編輯／封存／切換＋資料隔離測試 | 完成 |
| 3 | 日期工具＋週期計算／預測純函式＋測試 | 完成 |
| 4 | 經期：開始／結束／補登／編輯／刪除、防重疊 | 完成 |
| 5 | 每日紀錄：單日一筆、症狀多選（無症狀互斥） | 完成 |
| 6 | 月曆：月份切換、實際／預測／有紀錄標示、點日期看詳情與新增 | 完成 |
| 7 | 首頁摘要、快速操作、分析頁 | 完成 |
| 8 | JSON 匯出、刪除帳號、隱私權政策／使用條款、安全強化、e2e | 完成；**部署待辦**（要先建 Neon 專案） |

## 本機開發

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

不設任何環境變數就是**本機示範模式**：資料存在 `web/.data/pglite`（PGlite，啟動時自動跑 migration），登入頁可一鍵以示範使用者登入。

- 示範使用者 A：兩個 Profile（自己 6 次經期＋每日紀錄；「媽媽」1 次經期＋預設週期 30 天）
- 示範使用者 B：空的，用來確認兩個帳號的資料互相看不到

常用指令（都在 `web/`）：

| 指令 | 用途 |
| --- | --- |
| `npm test` | Vitest：純函式＋PGlite 整合測試（含 RLS 隔離、限流、匯出、刪除帳號） |
| `npm run test:e2e` | Playwright：先建置，再以本機示範模式（記憶體 PGlite）跑手機＋桌面的端對端測試；用電腦上的 Chrome。剛建置過可設 `E2E_SKIP_BUILD=1` 跳過建置 |
| `npm run typecheck` | 產生路由型別後跑 tsc |
| `npm run lint` | ESLint |
| `npm run build` | 正式建置 |
| `npm run db:migrate` | 對 `DATABASE_URL_UNPOOLED`（或 `DATABASE_URL`）依序跑 `db/migrations/*.sql`，最後檢查權限與 RLS |

用 `next start` 在本機示範時要設 `LUNE_LOCAL_MODE=1` 與 `BETTER_AUTH_SECRET`（正式模式沒設資料庫會直接報錯，不會默默改用本機資料庫）。

### 環境變數

見 [`web/.env.example`](web/.env.example)。正式環境需要：

- `DATABASE_URL`：Neon 的 pooled 連線字串（主機名稱含 `-pooler`）
- `DATABASE_URL_UNPOOLED`：Neon 的 direct 連線，只給 `npm run db:migrate`
- `BETTER_AUTH_SECRET`：至少 32 個字元
- `BETTER_AUTH_URL`：網站網址
- `LUNE_CONTACT_EMAIL`：隱私權政策與使用條款上的聯絡信箱（沒設會顯示「尚未設定」）

部署在 Vercel 時，沒有 `DATABASE_URL` 會直接報錯；就算設了 `LUNE_LOCAL_MODE`，也不會進入本機示範模式。示範模式有寫死密碼的帳號，不能出現在公開網站。

## 架構

- **Next.js 16.4（App Router）＋ TypeScript ＋ Tailwind CSS 4**；`cacheComponents` 關閉（全是個人即時資料）
- **Neon Postgres ＋ Drizzle**；本機與測試用 **PGlite**（同一份 migration，含 RLS 與 `btree_gist`）
- **Better Auth**（Email＋密碼）：使用者表在 `auth` schema；沒有對外的 `/api/auth`，登入／註冊／登出都走 Server Action，並用資料庫計數限流
- 資料表在 `lune` schema：`profiles`、`periods`、`daily_logs`、`rate_limits`
- 每個伺服器查詢都經過 `withUser`：交易內切成 `authenticated` 角色並帶入使用者 ID，RLS（`user_id = auth.uid()`）是服務層之外的第二道防線
- 目前選的 Profile 存在 `lune-profile` cookie；它只是偏好，伺服器每次都驗證歸屬

```
web/
  db/migrations/          SQL migration（可重複執行；本機啟動與 db:migrate 共用）
  scripts/migrate.ts      對 Postgres 跑 migration 並檢查權限
  src/
    app/                  頁面與 Server Actions（actions.ts）
    lib/
      date/date-utils.ts  日期工具（全部字串運算，不受時區影響）、月曆格
      cycle/              週期統計、預測、月曆標示、經期重疊規則（純函式）
      services/           資料存取（profiles、periods、daily-logs、export、rate-limit、login-guard、範例資料）
      validation/         zod 驗證（前後端共用）
      db/                 連線、schema、withUser
      auth/               Better Auth、session、示範使用者
  tests/                  Vitest（純函式＋PGlite 整合）
  e2e/                    Playwright 端對端測試（手機＋桌面）
```

## 視覺

方案 A「霧藍星球」（提案稿與另一個沒採用的方案在 [`design/proposals.html`](design/proposals.html)）。token 與元件樣式都在 `web/src/app/globals.css`。

- **底色**：霧藍漸層＋細織紋＋顆粒雜訊，文字一律白色。文字區的底色不淺於 `#477A92`（白字對比 4.7:1）；更淺的霧藍只用在裝飾。
- **光球**：漸層圓（`orb-rose`、`orb-lavender`、`orb-peach`、`orb-sage`、`orb-sky`、`orb-sand`），也是 Profile 的代表色。實際經期一律用玫瑰色，預測用虛線圈（`orb-predicted`）。光球上的字用深色 `#2B2A33`。
- **版面手法**：
  - 首頁一顆大光球放「週期第 N 天」，兩顆小光球（預測／上次經期）用細線連起來；
  - 快速操作是三個交疊的手繪感橢圓（`oval`）；
  - 分析頁把每次經期畫成星座，左右錯位往下排；
  - 寬字距英文標題（Outfit）配中文小標。
- **元件**：玻璃面板（`glass`）、深色玻璃（`glass-deep`）、細線圓形按鈕（`circle-btn`）、選項膠囊（`chip`）。新增／編輯用原生 `<dialog>` 做底部面板（手機貼底、桌面置中）。
- **導覽**：手機是底部的玻璃膠囊；桌面（≥1024px）是左側導覽，頂部是 Profile 切換器。
- **不只靠顏色**：月曆的實際經期是實心光球、預測經期是虛線圈、可能開始是點狀底線、今天是白色細圈、有紀錄是小圓點；另附圖例，每格的 `aria-label` 都寫出狀態。
- **字型**：自架，用 `web/scripts/subset-font.py` 產生到 `web/src/app/fonts/`。英數用 Outfit，中文用 Noto Sans TC 分片。介面新增中文字後要重跑 noto-sans-tc。
- **動態**：光球緩慢漂浮、面板進場；系統開啟「減少動態」時全部停用。
- **不使用 shadcn/ui**：視覺高度客製，元件數量少，用原生 `<dialog>` 加少量自製元件即可，不必另外引入元件庫。

## 與規格的差異

| 項目 | 規格 | 實作 | 理由 |
| --- | --- | --- | --- |
| 後端 | Firebase Auth＋Firestore | Neon Postgres＋Better Auth＋Drizzle | 沿用既有專案已驗證的架構；本機示範模式不需任何金鑰 |
| 安全規則 | Firestore Security Rules | RLS＋伺服器端 zod 驗證＋PGlite 上的隔離測試 | 對應「不能只靠前端過濾」 |
| 防重疊 | 前端檢查 | 服務層先檢查並回清楚訊息；資料庫另有排除約束（同 Profile 經期日期不重疊）、部分唯一索引（最多一筆進行中）、每日紀錄 (Profile, 日期) 唯一 | 補登或同時送出的請求也擋得住 |
| 經期資料 | `cycles` 集合＋`status` 欄位 | `periods` 表（一筆＝一次經期），狀態由 `end_date` 是否為空推導 | 「週期」是兩次經期之間，名稱不混用；避免兩欄不一致 |
| 設定 | `settings/preferences` 與 profile 重複存預設週期 | 併入 `profiles` | 規格裡兩處重複 |
| 月曆 | 自製或 FullCalendar | 自製 | 只需要月檢視與標示 |
| 排卵推估 | 未來功能、可關閉 | MVP 不做，也不放開關 | 規格本身標為未來功能 |
| 資料匯出／刪除帳號 | P1／Phase 6 | JSON 匯出＋刪除帳號放進 MVP（Phase 8） | 隱私要求第 6 點 |
| 「今天」 | 使用者所在地的日期 | 寫入時由瀏覽器傳入，伺服器只確認與 UTC 日期相差不超過一天；頁面顯示用的「今天」依瀏覽器回報的時區（`lune-tz` cookie）計算 | 伺服器在 UTC，不能自己判斷使用者的今天 |
| UI 元件 | shadcn/ui | 原生 `<dialog>`＋少量自製元件 | 視覺高度客製，元件少 |

## 週期計算與預測規則

程式在 `web/src/lib/cycle/`，測試在 `web/tests/cycle.test.ts`。

- 日期一律 `YYYY-MM-DD`（Postgres `date`）；所有運算都是日曆日期，不用時間戳相減。
- **週期長度**＝下次經期開始日－本次開始日；**經期長度**含頭尾，只算已結束的經期。
- 間隔少於 15 天或超過 90 天不列入平均，並提示使用者檢查（可能重複記錄或漏記）。
- 取最近 6 個有效間隔平均（四捨五入）；**至少 2 個**才用個人平均，否則用 Profile 的預設週期，兩者都沒有就不預測，顯示「累積更多紀錄後即可預測」。
- 預測一律是**日期區間**：預設值來源 ±3 天（信心低）；2–3 個間隔至少 ±2 天；4 個以上依標準差（±1～7 天）。最近幾次最長與最短差超過 7 天標為「不規則」，信心最高只到中，並提醒僅供參考。
- 預估經期天數：最近 6 次已結束經期的平均 → Profile 預設 → 未知（月曆只標開始區間）。
- 經期進行中超過 10 天，提示「是否忘了按結束」。
- 超過預測區間仍沒有新的經期：狀態為「比預測晚 N 天」，不自動把預測往後推。
- 距離最近一次開始日超過 90 天：不顯示週期天數、不預測（可能漏記）。
- 補登某天的症狀不會讓那天變成經期；經期只看經期紀錄。

## 隱私與安全

- 每筆資料都綁定 `user_id` 與 `profile_id`；經期與每日紀錄用 (profile_id, user_id) 複合外鍵綁定，不能掛到別人的 Profile。
- 錯誤日誌只記錯誤類型與代碼，不記任何健康紀錄內容。
- **匯出**：設定頁「下載我的資料」→ `GET /api/export`，回傳這個帳號所有 Profile（含已封存）、經期與每日紀錄的 JSON（格式 `lune-export@1`）。不快取。
- **刪除帳號**：設定頁一定要勾選確認並重新輸入密碼；刪除 `auth.users` 後由外鍵連帶刪除所有 Profile 與紀錄，session 同時失效。
- **隱私權政策／使用條款**：`/privacy`、`/terms`，不用登入就能看；聯絡信箱由 `LUNE_CONTACT_EMAIL` 提供。
- **登入限制**（`web/src/lib/services/login-guard.ts`）：
  - 每個 IP 的所有嘗試，每 10 分鐘 30 次；
  - 同一來源對同一帳號只計失敗，每 15 分鐘 5 次，成功就清掉；
  - 同一帳號所有來源合計失敗，每小時 50 次。

  別人猜錯密碼，不會鎖住你從自己的裝置登入。刪除帳號時輸入的密碼也套用同一套限制。
- **已知取捨**：註冊時會告知「Email 已註冊」。沒有寄信驗證的流程，就無法完全避免有人藉此查出某個 Email 有沒有註冊；目前靠 IP 限流降低大量探測。之後接上寄信服務時，改成「一律回覆已寄出驗證信」。
- **安全標頭**（`web/next.config.ts`）：
  - `X-Frame-Options: DENY` 與 `frame-ancestors 'none'`：不能被其他網站嵌入；
  - `nosniff`、`Referrer-Policy: same-origin`、`Permissions-Policy`；
  - 正式環境另加 HSTS。
