import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuth, ensureLocalUsers } from "@/lib/auth/better-auth";
import { LOCAL_USERS } from "@/lib/auth/local-users";
import { computeCycleSummary } from "@/lib/cycle/cycle-predictor";
import { dateInTimezone, DEFAULT_TIMEZONE } from "@/lib/date/date-utils";
import type { Db } from "@/lib/db/local";
import { withUser } from "@/lib/db/with-user";
import { listPeriods } from "@/lib/services/periods";
import { listProfiles } from "@/lib/services/profiles";
import { createTestDb, rowsOf } from "./helpers/db";

let db: Db;
let auth: ReturnType<typeof createAuth>;

beforeEach(async () => {
  db = await createTestDb();
  auth = createAuth(db);
});

/** 從 Better Auth 的回應取出 session cookie，模擬瀏覽器下一個請求 */
async function signInCookie(email: string, password: string): Promise<string> {
  const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = /(better-auth\.session_token=[^;]+)/.exec(setCookie);
  if (!match) throw new Error(`沒有 session cookie：${setCookie}`);
  return match[1];
}

describe("Better Auth（PGlite）", () => {
  it("註冊後可登入；session 對應到 auth.users 的 uuid；自動建立第一個 Profile", async () => {
    const signUp = await auth.api.signUpEmail({
      body: { email: "yuki@example.test", password: "correct-horse-9", name: "Yuki" },
    });
    expect(signUp.user.id).toMatch(/^[0-9a-f-]{36}$/);

    const cookie = await signInCookie("yuki@example.test", "correct-horse-9");
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.id).toBe(signUp.user.id);

    const profiles = await listProfiles(db, signUp.user.id);
    expect(profiles.map((p) => p.displayName)).toEqual(["Yuki"]);
    const uid = rowsOf<{ uid: string }>(
      await withUser(db, signUp.user.id, (tx) => tx.execute(sql`select auth.uid()::text as uid`)),
    );
    expect(uid[0].uid).toBe(signUp.user.id);
  });

  it("密碼錯誤或帳號不存在都回 401；重複註冊回 422；密碼太短 400", async () => {
    await auth.api.signUpEmail({ body: { email: "a@example.test", password: "password-123", name: "A" } });
    expect(
      (await auth.api.signInEmail({ body: { email: "a@example.test", password: "wrong-password" }, asResponse: true }))
        .status,
    ).toBe(401);
    expect(
      (
        await auth.api.signInEmail({
          body: { email: "nobody@example.test", password: "password-123" },
          asResponse: true,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await auth.api.signUpEmail({
          body: { email: "A@example.test", password: "password-123", name: "A2" },
          asResponse: true,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await auth.api.signUpEmail({
          body: { email: "b@example.test", password: "short", name: "B" },
          asResponse: true,
        })
      ).status,
    ).toBe(400);
  });

  it("登出後 session 失效", async () => {
    await auth.api.signUpEmail({ body: { email: "c@example.test", password: "password-123", name: "C" } });
    const cookie = await signInCookie("c@example.test", "password-123");
    await auth.api.signOut({ headers: new Headers({ cookie }) });
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });

  it("示範使用者可重複建立；A 有兩個 Profile 與範例紀錄、B 只有空的 Profile", async () => {
    await ensureLocalUsers(auth, db);
    await ensureLocalUsers(auth, db);
    const n = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from auth.users`));
    expect(n[0].n).toBe(2);

    const cookie = await signInCookie(LOCAL_USERS[0].email, LOCAL_USERS[0].password);
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    const aId = session!.user.id;
    const profiles = await listProfiles(db, aId);
    expect(profiles.map((p) => p.displayName)).toEqual([LOCAL_USERS[0].label, "媽媽"]);
    const periods = await listPeriods(db, aId, profiles[0].id);
    expect(periods).toHaveLength(6);
    const today = dateInTimezone(new Date(), DEFAULT_TIMEZONE);
    const summary = computeCycleSummary(periods, profiles[0], today);
    expect(summary).toMatchObject({ status: "waiting", cycleDay: 13 });
    expect(summary.prediction).toMatchObject({ source: "personal", confidence: "high", cycleLength: 29 });
    const mom = computeCycleSummary(await listPeriods(db, aId, profiles[1].id), profiles[1], today);
    expect(mom.prediction).toMatchObject({ source: "default", confidence: "low", cycleLength: 30 });

    const cookieB = await signInCookie(LOCAL_USERS[1].email, LOCAL_USERS[1].password);
    const sessionB = await auth.api.getSession({ headers: new Headers({ cookie: cookieB }) });
    const bProfiles = await listProfiles(db, sessionB!.user.id);
    expect(bProfiles).toHaveLength(1);
    expect(await listPeriods(db, sessionB!.user.id, bProfiles[0].id)).toHaveLength(0);
  });

  it("示範使用者 A 已存在但範例資料沒寫成功：下次啟動會補上，而且不會重複", async () => {
    // 模擬「帳號建好、播種失敗」：直接用 Better Auth 註冊 A，不播種
    await auth.api.signUpEmail({
      body: { email: LOCAL_USERS[0].email, password: LOCAL_USERS[0].password, name: LOCAL_USERS[0].label },
    });
    await ensureLocalUsers(auth, db);
    await ensureLocalUsers(auth, db);
    const counts = rowsOf<{ profiles: number; periods: number }>(
      await db.execute(sql`
        select (select count(*)::int from lune.profiles p join auth.users u on u.id = p.user_id where u.email = ${LOCAL_USERS[0].email}) profiles,
               (select count(*)::int from lune.periods p join auth.users u on u.id = p.user_id where u.email = ${LOCAL_USERS[0].email}) periods`),
    );
    expect(counts[0]).toEqual({ profiles: 2, periods: 7 });
  });
});

describe("刪除帳號", () => {
  it("要帶正確密碼；成功後帳號、Profile、經期、每日紀錄全部刪除，session 失效", async () => {
    const { user } = await auth.api.signUpEmail({
      body: { email: "del@example.test", password: "password-123", name: "Del" },
    });
    const [profile] = await listProfiles(db, user.id);
    await db.execute(
      sql`insert into lune.periods (user_id, profile_id, start_date, end_date) values (${user.id}, ${profile.id}, '2026-10-01', '2026-10-05')`,
    );
    await db.execute(
      sql`insert into lune.daily_logs (user_id, profile_id, log_date, mood) values (${user.id}, ${profile.id}, '2026-10-02', 'calm')`,
    );
    const cookie = await signInCookie("del@example.test", "password-123");
    const headers = new Headers({ cookie });

    const wrong = await auth.api.deleteUser({ body: { password: "wrong-password" }, headers, asResponse: true });
    expect(wrong.status).toBe(400);
    expect(await auth.api.getSession({ headers })).not.toBeNull();

    await auth.api.deleteUser({ body: { password: "password-123" }, headers });
    expect(await auth.api.getSession({ headers })).toBeNull();
    const left = rowsOf<{ n: number }>(
      await db.execute(sql`
        select (select count(*) from auth.users where id = ${user.id})
             + (select count(*) from lune.profiles where user_id = ${user.id})
             + (select count(*) from lune.periods where user_id = ${user.id})
             + (select count(*) from lune.daily_logs where user_id = ${user.id})
             + (select count(*) from auth.sessions where user_id = ${user.id})
             + (select count(*) from auth.accounts where user_id = ${user.id}) as n`),
    );
    expect(Number(left[0].n)).toBe(0);
  });
});
