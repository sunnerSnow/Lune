import type { Db } from "@/lib/db/local";
import { consumeRateLimit, resetRateLimit, underRateLimit } from "@/lib/services/rate-limit";

/**
 * 登入與敏感操作的嘗試限制。
 * - 每個 IP：所有嘗試（登入＋註冊）每 10 分鐘 30 次，擋大量掃描。
 * - 同一個來源對同一個帳號：只計「失敗」，每 15 分鐘 5 次；成功登入就清掉。
 *   別人從自己的 IP 猜錯密碼，不會鎖住你從自己的裝置登入。
 * - 同一個帳號所有來源合計：失敗每小時 50 次，擋分散 IP 的暴力破解。
 *   門檻刻意設高：要靠這條鎖住別人的帳號，得先失敗 50 次。
 */
export const IP_ATTEMPTS = { max: 30, windowSeconds: 600 };
export const SOURCE_FAILURES = { max: 5, windowSeconds: 900 };
export const ACCOUNT_FAILURES = { max: 50, windowSeconds: 3600 };

const keys = (ip: string, account: string) => {
  const a = account.toLowerCase();
  return { ip: `login:ip:${ip}`, source: `login:fail:${ip}:${a}`, account: `login:fail:${a}` };
};

/** 嘗試前呼叫：計入一次 IP 嘗試，並確認這個帳號還沒被鎖。false＝這次不要嘗試 */
export async function allowAttempt(db: Db, ip: string, account: string): Promise<boolean> {
  const k = keys(ip, account);
  const ipOk = await consumeRateLimit(db, k.ip, IP_ATTEMPTS.max, IP_ATTEMPTS.windowSeconds);
  if (!ipOk) return false;
  const [sourceOk, accountOk] = await Promise.all([
    underRateLimit(db, k.source, SOURCE_FAILURES.max, SOURCE_FAILURES.windowSeconds),
    underRateLimit(db, k.account, ACCOUNT_FAILURES.max, ACCOUNT_FAILURES.windowSeconds),
  ]);
  return sourceOk && accountOk;
}

/** 密碼錯誤時呼叫 */
export async function recordFailure(db: Db, ip: string, account: string): Promise<void> {
  const k = keys(ip, account);
  await Promise.all([
    consumeRateLimit(db, k.source, SOURCE_FAILURES.max, SOURCE_FAILURES.windowSeconds),
    consumeRateLimit(db, k.account, ACCOUNT_FAILURES.max, ACCOUNT_FAILURES.windowSeconds),
  ]);
}

/** 成功時呼叫：清掉這個來源的失敗次數（帳號合計的不清，那是攻擊的跡象） */
export async function recordSuccess(db: Db, ip: string, account: string): Promise<void> {
  await resetRateLimit(db, keys(ip, account).source);
}
