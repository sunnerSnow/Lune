/**
 * 執行模式：
 * - Postgres 模式：有 DATABASE_URL（正式環境用 Neon；也可以是任何 Postgres）
 * - 本機示範模式：沒有 DATABASE_URL；資料存在本機 PGlite，登入頁多了一鍵登入的示範使用者
 * 正式環境（NODE_ENV=production）沒設 DATABASE_URL 會直接報錯，不會默默改用本機資料庫。
 */
export function isLocalMode(): boolean {
  if (process.env.DATABASE_URL) return false;
  // 示範模式有寫死密碼的帳號，等於後門：部署在 Vercel 上一律不允許，就算設了 LUNE_LOCAL_MODE 也一樣
  if (process.env.VERCEL) {
    throw new Error("部署環境必須設定 DATABASE_URL；本機示範模式不能用在部署環境");
  }
  if (process.env.NODE_ENV === "production" && process.env.LUNE_LOCAL_MODE !== "1") {
    throw new Error("正式環境必須設定 DATABASE_URL；本機用 next start 示範時請設 LUNE_LOCAL_MODE=1");
  }
  return true;
}

/** 正式建置卻跑在示範模式（只該出現在本機 next start）：登入頁會顯示醒目警告 */
export function isLocalModeInProduction(): boolean {
  return process.env.NODE_ENV === "production" && isLocalMode();
}

/** Better Auth 的密鑰與網址；只有開發模式的本機示範允許省略（用固定的開發用密鑰），production 一律要設 */
export function authEnv(): { secret: string; baseURL: string | undefined } {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret && secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET 至少 32 個字元（可用 openssl rand -base64 32 產生）");
  }
  if (!secret && (!isLocalMode() || process.env.NODE_ENV === "production")) {
    throw new Error("必須設定 BETTER_AUTH_SECRET（至少 32 個字元）；只有 next dev 的本機示範模式可以省略");
  }
  return {
    secret: secret ?? "lune-local-demo-secret-not-for-production-00000000",
    baseURL: process.env.BETTER_AUTH_URL?.trim() || undefined,
  };
}

/**
 * 網站對外的網址（信裡的連結用）。只看設定，不看請求標頭：
 * 重設密碼連結若依 Host 標頭組出來，攻擊者偽造 Host 就能把別人的 token 導到自己的網域。
 * 順序：BETTER_AUTH_URL → Vercel 正式部署的正式網域、預覽部署的該次網址（預覽與正式是不同資料庫，連結指錯站會驗不過）→ 本機。
 */
export function appOrigin(): string {
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      throw new Error(`BETTER_AUTH_URL 不是合法網址：${configured}`);
    }
  }
  const vercelHost =
    process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_URL;
  if (vercelHost?.trim()) return `https://${vercelHost.trim()}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

export type MailProviderName = "gmail" | "log" | "none";

export interface MailEnv {
  provider: MailProviderName;
  /** Gmail 帳號（寄件者） */
  user: string | null;
  /** Gmail 應用程式密碼（不是登入密碼） */
  appPassword: string | null;
}

/**
 * 寄信設定（Email 驗證、忘記密碼）：
 * - gmail：用 Gmail 的 SMTP 寄信（GMAIL_USER＋GMAIL_APP_PASSWORD；應用程式密碼要先開啟兩步驟驗證才能建立）
 * - log：不寄信，把整封信印在伺服器日誌（連結含 token，只給本機開發與測試用；部署環境不允許）
 * - none：沒有寄信服務；忘記密碼與 Email 驗證不開放
 * 沒設 MAIL_PROVIDER：next dev 用 log，其他（正式建置、測試）都是 none。
 */
export function mailEnv(): MailEnv {
  const raw = (process.env.MAIL_PROVIDER || (process.env.NODE_ENV === "development" ? "log" : "none")).trim();
  if (raw !== "gmail" && raw !== "log" && raw !== "none") {
    throw new Error(`不支援的 MAIL_PROVIDER：${raw}（可用：gmail、log、none）`);
  }
  if (raw === "log" && process.env.VERCEL) {
    throw new Error("MAIL_PROVIDER=log 會把含 token 的連結寫進日誌，部署環境不能用");
  }
  const user = process.env.GMAIL_USER?.trim() || null;
  // Google 顯示的應用程式密碼是「四組四個字母」，中間有空白；複製時常連空白一起貼上
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "") || null;
  if (raw === "gmail" && (!user || !appPassword)) {
    throw new Error("MAIL_PROVIDER=gmail 需要設定 GMAIL_USER 與 GMAIL_APP_PASSWORD");
  }
  return { provider: raw, user, appPassword };
}

/**
 * 頁面與 Server Action 用：有沒有寄信服務。設定錯誤只記錄一次並視為沒有，
 * 不讓登入頁因為寄信設定壞掉整頁 500；真正建立寄信器時（createMailer）仍會丟出清楚的錯誤。
 */
let mailConfigWarned = false;
export function mailReady(): boolean {
  try {
    return mailEnv().provider !== "none";
  } catch (error) {
    if (!mailConfigWarned) {
      mailConfigWarned = true;
      console.error(`[lune] 寄信設定錯誤，忘記密碼與 Email 驗證暫時關閉：${(error as Error).message}`);
    }
    return false;
  }
}

/**
 * 是否要求註冊後先驗證 Email 才能登入（要有寄信服務；預設關閉，由 AUTH_REQUIRE_EMAIL_VERIFICATION=1 開啟）。
 * 本機示範模式不強制：示範帳號不會去收信。
 */
export function requireEmailVerification(): boolean {
  return process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "1" && !isLocalMode() && mailReady();
}
