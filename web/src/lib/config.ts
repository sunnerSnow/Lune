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
