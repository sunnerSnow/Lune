import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/local";
import {
  ACCOUNT_FAILURES,
  allowAttempt,
  IP_ATTEMPTS,
  recordFailure,
  recordSuccess,
  SOURCE_FAILURES,
} from "@/lib/services/login-guard";
import { consumeRateLimit, resetRateLimit, underRateLimit } from "@/lib/services/rate-limit";
import { createTestDb } from "./helpers/db";

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

describe("登入限制", () => {
  const victim = "victim@example.test";

  it("別人從自己的 IP 猜錯密碼，不會鎖住受害者從其他 IP 登入", async () => {
    for (let i = 0; i < SOURCE_FAILURES.max; i++) await recordFailure(db, "6.6.6.6", victim);
    expect(await allowAttempt(db, "6.6.6.6", victim)).toBe(false);
    expect(await allowAttempt(db, "1.2.3.4", victim)).toBe(true);
  });

  it("成功登入會清掉同一來源的失敗次數", async () => {
    for (let i = 0; i < SOURCE_FAILURES.max; i++) await recordFailure(db, "1.2.3.4", victim);
    expect(await allowAttempt(db, "1.2.3.4", victim)).toBe(false);
    await recordSuccess(db, "1.2.3.4", victim);
    expect(await allowAttempt(db, "1.2.3.4", victim)).toBe(true);
  });

  it("同一帳號所有來源合計失敗太多次（分散 IP 暴力破解）就全部擋下", async () => {
    for (let i = 0; i < ACCOUNT_FAILURES.max; i++) await recordFailure(db, `10.0.0.${i}`, victim);
    expect(await allowAttempt(db, "1.2.3.4", victim)).toBe(false);
    expect(await allowAttempt(db, "1.2.3.4", "someone-else@example.test")).toBe(true);
  });

  it("同一 IP 嘗試太多次（不論帳號）就擋下；Email 大小寫視為同一帳號", async () => {
    for (let i = 0; i < IP_ATTEMPTS.max; i++) expect(await allowAttempt(db, "9.9.9.9", `u${i}@example.test`)).toBe(true);
    expect(await allowAttempt(db, "9.9.9.9", "new@example.test")).toBe(false);
    for (let i = 0; i < SOURCE_FAILURES.max; i++) await recordFailure(db, "5.5.5.5", "Case@Example.test");
    expect(await allowAttempt(db, "5.5.5.5", "case@example.test")).toBe(false);
  });
});
