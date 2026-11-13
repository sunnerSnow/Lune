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
| 8 | JSON 匯出、刪除帳號、隱私權政策／使用條款、安全強化、e2e、部署 | 完成（Vercel＋Neon 新加坡） |
| P1 | 分析頁趨勢圖與症狀／心情頻率、CSV 匯出、預測加入行事曆（.ics） | 完成；提醒通知未做（需要推播服務） |

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
| `npm test` | Vitest：純函式＋PGlite 整合測試（含 RLS 隔離、限流、匯出、刪除帳號、Email 驗證與重設密碼、提醒排程） |
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
- `MAIL_PROVIDER=gmail`、`GMAIL_USER`、`GMAIL_APP_PASSWORD`：寄 Email 驗證信與重設密碼信。沒設就不開放忘記密碼與 Email 驗證，登入頁也不會出現「忘記密碼？」。
  - `GMAIL_APP_PASSWORD` 是 Google 帳號的「應用程式密碼」，不是登入密碼；要先開啟兩步驟驗證才能建立。
  - `next dev` 沒設 `MAIL_PROVIDER` 時用 `log`：不寄信，把整封信印在終端機。部署環境不允許 `log`。
- `AUTH_REQUIRE_EMAIL_VERIFICATION=1`（選填）：註冊後要先驗證 Email 才能登入。預設關閉：註冊直接登入，同時寄一封驗證信，設定頁可以重寄。
- `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`：提醒通知（Web Push）的金鑰，用 `cd web && npx web-push generate-vapid-keys` 產生。沒設時設定頁不顯示「提醒」。金鑰換掉後，所有裝置都要重新開啟通知。
- `CRON_SECRET`：每天排程呼叫 `/api/cron/reminders` 用的密鑰，至少 32 個字元。Vercel 設了這個變數後，排程會自動帶上。

部署在 Vercel 時，沒有 `DATABASE_URL` 會直接報錯；就算設了 `LUNE_LOCAL_MODE`，也不會進入本機示範模式。示範模式有寫死密碼的帳號，不能出現在公開網站。

> `.env.local` 填了 Neon 的連線字串後，本機 `npm run dev` 會直接讀寫正式資料庫。只想在本機試用時，請把 `DATABASE_URL` 清空。端對端測試已經強制使用記憶體資料庫。

## 部署

- **資料庫**：Neon，區域 AWS `ap-southeast-1`（新加坡）。新增 migration 後，執行 `cd web && npm run db:migrate`（用 `DATABASE_URL_UNPOOLED`）。
- **網站**：Vercel，Root Directory 設 `web`。`web/vercel.json` 把伺服器放在 `sin1`（新加坡），跟資料庫同一區。
- **Vercel 環境變數**：只設在 **Production**。值前後不要加引號，Vercel 會把引號當成值的一部分。

  | 變數 | 說明 |
  | --- | --- |
  | `DATABASE_URL` | Neon 的 pooled 連線（主機名稱含 `-pooler`） |
  | `BETTER_AUTH_SECRET` | 至少 32 個字元 |
  | `BETTER_AUTH_URL` | 正式網址，結尾不加 `/` |
  | `LUNE_CONTACT_EMAIL` | 隱私權政策與使用條款上的聯絡信箱 |
  | `MAIL_PROVIDER` | `gmail` |
  | `GMAIL_USER` | 寄件的 Gmail 地址 |
  | `GMAIL_APP_PASSWORD` | 這個 Gmail 的應用程式密碼（16 個字母，有沒有空白都可以） |
  | `AUTH_REQUIRE_EMAIL_VERIFICATION` | 選填，`1` 表示要先驗證 Email 才能登入 |
  | `VAPID_PUBLIC_KEY`／`VAPID_PRIVATE_KEY` | 提醒通知的金鑰 |
  | `CRON_SECRET` | 排程密鑰，至少 32 個字元 |

  - **排程**：`web/vercel.json` 設定每天 UTC 01:00（台灣時間早上 9 點）呼叫 `/api/cron/reminders`。Vercel 免費方案只保證在那一個小時內執行。

  - **Preview 不要填正式資料庫的連線字串**：不然任何預覽網址都能讀寫正式使用者的健康紀錄。沒設資料庫時，Preview 部署可以建置，但頁面會直接報錯。需要預覽時，另外開一個 Neon branch，給 Preview 用它的連線字串和一組不同的密鑰。
  - 不要設 `LUNE_LOCAL_MODE`。`DATABASE_URL_UNPOOLED` 只有本機跑 migration 時用得到。

## 架構

- **Next.js 16.4（App Router）＋ TypeScript ＋ Tailwind CSS 4**；`cacheComponents` 關閉（全是個人即時資料）
- **Neon Postgres ＋ Drizzle**；本機與測試用 **PGlite**（同一份 migration，含 RLS 與 `btree_gist`）
- **Better Auth**（Email＋密碼）：使用者表在 `auth` schema；沒有對外的 `/api/auth`，登入／註冊／登出都走 Server Action，並用資料庫計數限流
- 資料表在 `lune` schema：`profiles`、`periods`、`daily_logs`、`rate_limits`、`push_subscriptions`、`reminder_sends`
- 每個伺服器查詢都經過 `withUser`：交易內切成 `authenticated` 角色並帶入使用者 ID，RLS（`user_id = auth.uid()`）是服務層之外的第二道防線
- 目前選的 Profile 存在 `lune-profile` cookie；它只是偏好，伺服器每次都驗證歸屬

```
web/
  db/migrations/          SQL migration（可重複執行；本機啟動與 db:migrate 共用）
  scripts/migrate.ts      對 Postgres 跑 migration 並檢查權限
  scripts/build-brand.mjs 產生品牌向量檔、圖示、favicon、分享預覽圖
  scripts/subset-font.py  自架字型分片；wordmark-path.py 把字標轉成路徑
  src/
    app/                  頁面與 Server Actions（actions.ts）
    lib/
      date/date-utils.ts  日期工具（全部字串運算，不受時區影響）、月曆格
      cycle/              週期統計、預測、月曆標示、經期重疊規則（純函式）
      services/           資料存取（profiles、periods、daily-logs、export、rate-limit、login-guard、範例資料）
      validation/         zod 驗證（前後端共用）
      db/                 連線、schema、withUser
      auth/               Better Auth、session、示範使用者
      mail.ts             寄信（Gmail SMTP）、寄信額度、信件內容
      push.ts             送推播通知（Web Push／VAPID）
      reminders/          提醒規則（純函式）、排程授權
  tests/                  Vitest（純函式＋PGlite 整合）
  e2e/                    Playwright 端對端測試（手機＋桌面）
```

## 品牌

完整規範在 [`docs/brand-guidelines.md`](docs/brand-guidelines.md)，內容包括語氣、用詞、標誌使用規則、色彩與對比、字型、圖形元素。

- **標誌**：C「週期軌道」，提案稿在 [`design/logo-proposals.html`](design/logo-proposals.html)。向量檔放在 `docs/brand/`；頁面上用的元件是 `web/src/components/ui/brand-mark.tsx`。
- **圖示、PWA、分享預覽圖**：都由 `cd web && node scripts/build-brand.mjs` 產生，會用到電腦上的 Chrome。產出包括：
  - `src/app/icon.svg`、`favicon.ico`、`apple-icon.png`、`opengraph-image.png`；
  - `public/icons/icon-192／512、maskable-512.png`。

  PWA 設定在 `src/app/manifest.ts`。

## 視覺

方案 A「霧藍星球」（提案稿與另一個沒採用的方案在 [`design/proposals.html`](design/proposals.html)）。token 與元件樣式都在 `web/src/app/globals.css`。

- **底色**：霧藍漸層＋細織紋＋顆粒雜訊，文字一律白色。
  - 文字的底色「畫出來」不能淺於 `#477A92`（白字 4.7:1）。顆粒雜訊會把底色提亮約 8 階，所以底層漸層刻意調深（`#40728A → #3A687E`）。
  - 更淺的霧藍只用在裝飾。
  - 玻璃面板用偏深的半透明，不用白色半透明。
- **量對比**：只看色碼不準，要量實際畫出來的畫面。做法是用無頭瀏覽器把文字暫時設成透明後截圖，再到原本有文字的範圍內取樣底色。2026-11-12 量過首頁、日曆、分析、設定、記錄面板，白字最低 4.62:1。
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
- **匯出**（設定頁「匯出」，全部不快取、自己檢查登入）：
  - `GET /api/export`：這個帳號所有 Profile（含已封存）、經期與每日紀錄的 JSON（格式 `lune-export@1`）。
  - `GET /api/export/csv?kind=periods|daily-logs`：CSV，開頭有 UTF-8 BOM，換行是 CRLF。使用者輸入的欄位如果以 `= + - @` 開頭，會加單引號，防止試算表公式注入。
  - `GET /api/export/ics?title=…`：把目前 Profile 的下一次預測區間匯出成全天事件。
    - 事件名稱只能從中性的預設選項挑；
    - 檔案裡沒有任何健康內容或 Profile 名稱；
    - 匯出前會先在面板裡預覽。
- **刪除帳號**：設定頁一定要勾選確認並重新輸入密碼；刪除 `auth.users` 後由外鍵連帶刪除所有 Profile 與紀錄，session 同時失效。
- **隱私權政策／使用條款**：`/privacy`、`/terms`，不用登入就能看；聯絡信箱由 `LUNE_CONTACT_EMAIL` 提供。
- **登入限制**（`web/src/lib/services/login-guard.ts`）：
  - 每個 IP 的所有嘗試，每 10 分鐘 30 次；
  - 同一來源對同一帳號只計失敗，每 15 分鐘 5 次，成功就清掉；
  - 同一帳號所有來源合計失敗，每小時 50 次。

  別人猜錯密碼，不會鎖住你從自己的裝置登入。刪除帳號時輸入的密碼也套用同一套限制。
- **寄信**（`web/src/lib/mail.ts`，Gmail SMTP）：只寄 Email 驗證、重設密碼、「這個 Email 已經註冊過」三種純文字信，不放任何健康紀錄。
  - 信裡的連結用設定的網址組成（`BETTER_AUTH_URL`），不看請求的 Host 標頭，避免 token 被導到別的網域。
  - 連結打開後要按頁面上的按鈕才會用掉 token，信箱的連結預覽不會把它用掉。重設密碼連結 30 分鐘有效，驗證連結 24 小時。
  - 信在回應送出後才寄：帳號存不存在，回應時間都一樣。忘記密碼一律回「如果有註冊，信已寄出」。
  - 額度：同一個收件者每小時 5 封、全站每天 300 封（Gmail 個人帳號一天約 500 封上限）。
  - 重設密碼成功後，所有裝置的登入都會失效。
- **提醒通知**（Web Push，`web/src/lib/reminders/`、`web/public/sw.js`）：
  - 每個 Profile 各自設定：預測區間開始前 1–3 天提醒（一個週期一次）、超過 35 天沒有新增或修改紀錄時提醒（每段空窗一次）。
  - 排程每天早上跑一次，送到這個帳號開啟通知的每台裝置；`reminder_sends` 記錄送過的提醒，重跑不會重複。全部裝置都送失敗時退回，隔天再試；失效的訂閱（404／410）會刪掉。
  - 通知會出現在鎖定畫面，所以標題固定「Luné」，內文中性，不提經期、症狀或 Profile 名稱。點通知會切到對應的 Profile。
  - 訂閱的網址只接受各家瀏覽器的推播服務（Google、Mozilla、Microsoft、Apple），避免伺服器被拿來打任意網址。
  - iPhone／iPad 要先「加入主畫面」，從主畫面打開才能開啟通知（iOS 16.4 以上）。
  - 登出不會關掉裝置的通知；要停止請在設定頁按「關閉」。
- **已知取捨**：預設不要求驗證 Email，註冊時會告知「Email 已註冊」，有人可以藉此查出某個 Email 有沒有註冊，目前靠限流降低大量探測。設 `AUTH_REQUIRE_EMAIL_VERIFICATION=1` 後改成一律回「請收信」，已註冊的 Email 改寄通知給本人。
- **安全標頭**（`web/next.config.ts`）：
  - `X-Frame-Options: DENY` 與 `frame-ancestors 'none'`：不能被其他網站嵌入；
  - `nosniff`、`Referrer-Policy: same-origin`、`Permissions-Policy`；
  - 正式環境另加 HSTS。
