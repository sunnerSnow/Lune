import type { Db } from "@/lib/db/local";
import { consumeRateLimit, releaseRateLimit, resetRateLimit } from "@/lib/services/rate-limit";

/**
 * 登入與敏感操作的嘗試限制。
 * - 每個 IP：所有嘗試（登入＋註冊）每 10 分鐘 30 次，擋大量掃描。
 * - 同一個來源（IP＋帳號）：失敗每 15 分鐘 5 次；成功就清掉。
 *   別人從自己的 IP 猜錯密碼，不會鎖住你從自己的裝置登入。
 * - 同一個帳號所有來源合計：「密碼錯誤」每小時 50 次，擋分散 IP 的暴力破解。
 *   門檻刻意設高，而且只有真的送去驗證密碼的嘗試才會計入（見下）。
 *
 * 「先記一次、結果出來再修正」：每次嘗試在驗證密碼「之前」先把次數加一（原子 upsert），
 * 同時送出大量請求時，每個請求都先占到名額，不會在任何失敗被記下前全部通過檢查。
 * - 已被 IP 或來源限制擋下的請求不會碰帳號合計（否則單一 IP 就能把別人的帳號鎖住）。
 * - 帳號合計超限時退回剛記的來源次數。
 * - 結果：成功 → attemptSucceeded；密碼錯誤 → 什麼都不做（已經記過）；其他錯誤 → attemptAborted 全部退回。
 * - 註冊不計帳號合計（別人拿你的 Email 一直註冊，不該鎖住你的登入）。
 */
export const IP_ATTEMPTS = { max: 30, windowSeconds: 600 };
export const SOURCE_FAILURES = { max: 5, windowSeconds: 900 };
export const ACCOUNT_FAILURES = { max: 50, windowSeconds: 3600 };

const keys = (ip: string, account: string) => {
  const a = account.toLowerCase();
  return { ip: `login:ip:${ip}`, source: `login:fail:${ip}:${a}`, account: `login:fail:${a}` };
};

export interface AttemptOptions {
  /** 是否計入帳號合計（登入、刪除帳號要；註冊不要） */
  countAccount?: boolean;
}

/** 嘗試前呼叫。false＝已超過限制，這次不要嘗試（此時帳號合計不會被增加） */
export async function reserveAttempt(
  db: Db,
  ip: string,
  account: string,
  { countAccount = true }: AttemptOptions = {},
): Promise<boolean> {
  const k = keys(ip, account);
  if (!(await consumeRateLimit(db, k.ip, IP_ATTEMPTS.max, IP_ATTEMPTS.windowSeconds))) return false;
  if (!(await consumeRateLimit(db, k.source, SOURCE_FAILURES.max, SOURCE_FAILURES.windowSeconds))) return false;
  if (!countAccount) return true;
  if (!(await consumeRateLimit(db, k.account, ACCOUNT_FAILURES.max, ACCOUNT_FAILURES.windowSeconds))) {
    await releaseRateLimit(db, k.source);
    return false;
  }
  return true;
}

/** 成功：清掉這個來源的失敗次數，並退回帳號合計預先記的那一次 */
export async function attemptSucceeded(
  db: Db,
  ip: string,
  account: string,
  { countAccount = true }: AttemptOptions = {},
): Promise<void> {
  const k = keys(ip, account);
  await Promise.all([resetRateLimit(db, k.source), countAccount ? releaseRateLimit(db, k.account) : null]);
}

/** 不是密碼錯誤的失敗（伺服器錯誤、session 失效等）：預先記的都退回 */
export async function attemptAborted(
  db: Db,
  ip: string,
  account: string,
  { countAccount = true }: AttemptOptions = {},
): Promise<void> {
  const k = keys(ip, account);
  await Promise.all([releaseRateLimit(db, k.source), countAccount ? releaseRateLimit(db, k.account) : null]);
}
