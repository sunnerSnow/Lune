import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/local";
import {
  ACCOUNT_FAILURES,
  attemptAborted,
  attemptSucceeded,
  IP_ATTEMPTS,
  reserveAttempt,
  SOURCE_FAILURES,
} from "@/lib/services/login-guard";
import { consumeRateLimit, releaseRateLimit, resetRateLimit, underRateLimit } from "@/lib/services/rate-limit";
import { createTestDb, rowsOf } from "./helpers/db";

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

/** 把某個 key 的視窗開始時間往前推，模擬時間經過 */
async function age(key: string, seconds: number) {
  await db.execute(
    sql`update lune.rate_limits set window_start = window_start - make_interval(secs => ${seconds}) where key = ${key}`,
  );
}

describe("固定視窗限流（PGlite）", () => {
  it("上限內允許、超過就擋；不同 key 互不影響", async () => {
    for (let i = 0; i < 3; i++) expect(await consumeRateLimit(db, "k1", 3, 60)).toBe(true);
    expect(await consumeRateLimit(db, "k1", 3, 60)).toBe(false);
    expect(await consumeRateLimit(db, "k2", 3, 60)).toBe(true);
  });

  it("視窗過期後重新計算", async () => {
    for (let i = 0; i < 4; i++) await consumeRateLimit(db, "k", 3, 60);
    expect(await underRateLimit(db, "k", 3, 60)).toBe(false);
    await age("k", 61);
    expect(await underRateLimit(db, "k", 3, 60)).toBe(true);
    expect(await consumeRateLimit(db, "k", 3, 60)).toBe(true);
  });

  it("underRateLimit 只查不計；reset 清掉計數", async () => {
    await consumeRateLimit(db, "k", 2, 60);
    for (let i = 0; i < 5; i++) expect(await underRateLimit(db, "k", 2, 60)).toBe(true);
    await consumeRateLimit(db, "k", 2, 60);
    expect(await underRateLimit(db, "k", 2, 60)).toBe(false);
    await resetRateLimit(db, "k");
    expect(await underRateLimit(db, "k", 2, 60)).toBe(true);
  });
});

describe("登入限制（先記一次、成功再退回）", () => {
  const victim = "victim@example.test";
  /** 一次失敗的嘗試：預記之後沒有成功 */
  const fail = (ip: string, account = victim) => reserveAttempt(db, ip, account);

  it("同一來源失敗 5 次後擋下；別人從自己的 IP 猜錯，不會鎖住受害者從其他 IP 登入", async () => {
    for (let i = 0; i < SOURCE_FAILURES.max; i++) expect(await fail("6.6.6.6")).toBe(true);
    expect(await reserveAttempt(db, "6.6.6.6", victim)).toBe(false);
    expect(await reserveAttempt(db, "1.2.3.4", victim)).toBe(true);
  });

  it("成功會清掉同一來源的失敗次數：失敗 4 次＋成功 1 次之後，又可以再試 5 次", async () => {
    for (let i = 0; i < SOURCE_FAILURES.max - 1; i++) await fail("1.2.3.4");
    expect(await reserveAttempt(db, "1.2.3.4", victim)).toBe(true);
    await attemptSucceeded(db, "1.2.3.4", victim);
    for (let i = 0; i < SOURCE_FAILURES.max; i++) expect(await fail("1.2.3.4")).toBe(true);
    expect(await reserveAttempt(db, "1.2.3.4", victim)).toBe(false);
  });

  it("同時送出大量請求：每個請求在驗證前就占好名額，同一來源最多只通過 5 個", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => reserveAttempt(db, "7.7.7.7", victim)));
    expect(results.filter(Boolean)).toHaveLength(SOURCE_FAILURES.max);
  });

  it("同一帳號所有來源合計失敗太多次（分散 IP 暴力破解）就全部擋下；成功會退回預記的那一次", async () => {
    for (let i = 0; i < ACCOUNT_FAILURES.max - 1; i++) await fail(`10.0.${Math.floor(i / 4)}.${i % 4}`);
    // 第 50 次是成功的登入 → 退回，帳號合計仍是 49，還能再試一次
    expect(await reserveAttempt(db, "1.2.3.4", victim)).toBe(true);
    await attemptSucceeded(db, "1.2.3.4", victim);
    expect(await fail("1.2.3.5")).toBe(true);
    expect(await reserveAttempt(db, "1.2.3.6", victim)).toBe(false);
    expect(await reserveAttempt(db, "1.2.3.6", "someone-else@example.test")).toBe(true);
  });

  it("同一 IP 嘗試太多次（不論帳號）就擋下；Email 大小寫視為同一帳號", async () => {
    for (let i = 0; i < IP_ATTEMPTS.max; i++) expect(await reserveAttempt(db, "9.9.9.9", `u${i}@example.test`)).toBe(true);
    expect(await reserveAttempt(db, "9.9.9.9", "new@example.test")).toBe(false);
    for (let i = 0; i < SOURCE_FAILURES.max; i++) await fail("5.5.5.5", "Case@Example.test");
    expect(await reserveAttempt(db, "5.5.5.5", "case@example.test")).toBe(false);
  });

  it("被來源或 IP 限制擋下的請求不會灌帳號合計：單一 IP 連送 50 次，別的 IP 仍可登入", async () => {
    for (let i = 0; i < ACCOUNT_FAILURES.max; i++) await reserveAttempt(db, "6.6.6.6", victim);
    const [row] = rowsOf<{ count: number }>(
      await db.execute(sql`select count from lune.rate_limits where key = ${`login:fail:${victim}`}`),
    );
    expect(row.count).toBe(SOURCE_FAILURES.max);
    expect(await reserveAttempt(db, "1.2.3.4", victim)).toBe(true);
  });

  it("帳號合計超限時，退回剛記的來源次數（解鎖後不會再被來源限制多擋）", async () => {
    for (let i = 0; i < ACCOUNT_FAILURES.max; i++) await fail(`10.1.${Math.floor(i / 4)}.${i % 4}`);
    for (let i = 0; i < 3; i++) expect(await reserveAttempt(db, "1.2.3.4", victim)).toBe(false);
    const rows = rowsOf<{ count: number }>(
      await db.execute(sql`select count from lune.rate_limits where key = ${`login:fail:1.2.3.4:${victim}`}`),
    );
    expect(rows[0]?.count ?? 0).toBe(0);
  });

  it("註冊不計帳號合計：別人拿你的 Email 一直註冊，不會鎖住你的登入", async () => {
    for (let i = 0; i < ACCOUNT_FAILURES.max + 5; i++) {
      await reserveAttempt(db, `10.2.${Math.floor(i / 4)}.${i % 4}`, victim, { countAccount: false });
    }
    expect(await reserveAttempt(db, "1.2.3.4", victim)).toBe(true);
  });

  it("不是密碼錯誤的失敗（伺服器錯誤等）全部退回，不會累積成鎖定", async () => {
    for (let i = 0; i < SOURCE_FAILURES.max * 2; i++) {
      expect(await reserveAttempt(db, "1.2.3.4", victim)).toBe(true);
      await attemptAborted(db, "1.2.3.4", victim);
    }
  });

  it("退回不會讓次數低於 0", async () => {
    await releaseRateLimit(db, "nothing-here");
    await consumeRateLimit(db, "k", 3, 60);
    await releaseRateLimit(db, "k");
    await releaseRateLimit(db, "k");
    for (let i = 0; i < 3; i++) expect(await consumeRateLimit(db, "k", 3, 60)).toBe(true);
    expect(await consumeRateLimit(db, "k", 3, 60)).toBe(false);
  });
});
