import { defineConfig, devices } from "@playwright/test";

/**
 * 端對端測試：npm run test:e2e
 * - 先正式建置，再用 next start 起本機示範模式；資料庫是記憶體 PGlite（每次執行都是乾淨的）。
 * - DATABASE_URL 用空字串蓋掉，就算 .env.local 有正式連線字串也不會連過去。
 * - 用電腦上的 Chrome（channel: chrome），不另外下載瀏覽器；手機尺寸＋台北時區。
 * - E2E_SKIP_BUILD=1 可跳過建置（剛 build 過時）。
 */
const PORT = 3361;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" } },
    { name: "desktop", use: { viewport: { width: 1280, height: 860 }, channel: "chrome" }, grep: /@desktop/ },
  ],
  webServer: {
    command: process.env.E2E_SKIP_BUILD ? `npx next start -p ${PORT}` : `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DATABASE_URL: "",
      DATABASE_URL_UNPOOLED: "",
      LUNE_LOCAL_MODE: "1",
      PGLITE_DATA_DIR: "memory://",
      BETTER_AUTH_SECRET: "e2e-only-secret-not-for-production-0123456789",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      // 信印在伺服器輸出、不真的寄出；打開忘記密碼與 Email 驗證的畫面
      MAIL_PROVIDER: "log",
      GMAIL_USER: "",
      GMAIL_APP_PASSWORD: "",
    },
  },
});
