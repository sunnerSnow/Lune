import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth } from "@/lib/auth/better-auth";
import type { Db } from "@/lib/db/local";
import { MAIL_LIMITS, MailLimitError, type MailMessage, type Mailer, withMailLimits } from "@/lib/mail";
import { createTestDb, rowsOf } from "./helpers/db";

const ORIGIN = "https://lune.example.test";

let db: Db;
let sent: MailMessage[];
let mailer: Mailer;
let pending: Promise<unknown>[];

beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
  db = await createTestDb();
  sent = [];
  pending = [];
  mailer = {
    kind: "memory",
    async send(message) {
      sent.push(message);
    },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** 跟正式環境一樣在背景寄信；測試收集起來，呼叫完用 flush() 等信寄完 */
const authWith = (requireVerification: boolean, m: Mailer | null = mailer) =>
  createAuth(db, { mailer: m, requireVerification, background: (task) => void pending.push(task) });

const flush = () => Promise.all(pending.splice(0));

function tokenFrom(message: MailMessage, path: "/verify-email" | "/reset-password"): string {
  const match = new RegExp(`${ORIGIN.replaceAll(".", "\\.")}${path}\\?token=(\\S+)`).exec(message.text);
  if (!match) throw new Error(`信裡沒有 ${path} 連結：${message.text}`);
  return decodeURIComponent(match[1]);
}

function sessionCookie(res: Response): string {
  const match = /(better-auth\.session_token=[^;]+)/.exec(res.headers.get("set-cookie") ?? "");
  if (!match) throw new Error("沒有 session cookie");
  return match[1];
}

async function isVerified(email: string): Promise<boolean> {
  const rows = rowsOf<{ v: boolean }>(
    await db.execute(sql`select email_verified v from auth.users where lower(email) = ${email}`),
  );
  return rows[0]?.v === true;
}

async function countUsers(): Promise<number> {
  return rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from auth.users`))[0].n;
}

describe("要求驗證 Email", () => {
  it("註冊不會登入、寄出驗證信；驗證前登入被擋並再寄一封；驗證後要自己用密碼登入", async () => {
    const auth = authWith(true);
    const signUp = await auth.api.signUpEmail({
      body: { email: "new@example.test", password: "password-123", name: "New" },
    });
    expect(signUp.token).toBeNull();
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "new@example.test", subject: "Luné：請驗證你的 Email" });
    // 連結用設定的網址，不是請求的 Host
    const token = tokenFrom(sent[0], "/verify-email");

    const blocked = await auth.api.signInEmail({
      body: { email: "new@example.test", password: "password-123" },
      asResponse: true,
    });
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe("EMAIL_NOT_VERIFIED");
    await flush();
    expect(sent).toHaveLength(2);

    // 密碼錯誤時不寄信、也不透露帳號還沒驗證
    const wrong = await auth.api.signInEmail({
      body: { email: "new@example.test", password: "wrong-password" },
      asResponse: true,
    });
    expect(wrong.status).toBe(401);
    await flush();
    expect(sent).toHaveLength(2);

    // 驗證只證明收得到信：不發 session（不然先用別人 Email 註冊的人，可以讓本人點信就登入他設好密碼的帳號）
    const verified = await auth.api.verifyEmail({ query: { token }, asResponse: true });
    expect(verified.status).toBe(200);
    expect(verified.headers.get("set-cookie") ?? "").not.toContain("better-auth.session_token=");
    expect(await isVerified("new@example.test")).toBe(true);

    const ok = await auth.api.signInEmail({
      body: { email: "new@example.test", password: "password-123" },
      asResponse: true,
    });
    expect(ok.status).toBe(200);
    const session = await auth.api.getSession({ headers: new Headers({ cookie: sessionCookie(ok) }) });
    expect(session?.user).toMatchObject({ email: "new@example.test", emailVerified: true });
  });

  it("已登入時打開別人的驗證連結：只驗證那個帳號，目前的登入不會被換掉", async () => {
    const auth = authWith(true);
    await auth.api.signUpEmail({ body: { email: "me@example.test", password: "password-123", name: "Me" } });
    await auth.api.signUpEmail({ body: { email: "other@example.test", password: "password-123", name: "Other" } });
    await flush();
    const mine = tokenFrom(
      sent.find((m) => m.to === "me@example.test")!,
      "/verify-email",
    );
    const theirs = tokenFrom(
      sent.find((m) => m.to === "other@example.test")!,
      "/verify-email",
    );
    await auth.api.verifyEmail({ query: { token: mine } });
    const login = await auth.api.signInEmail({
      body: { email: "me@example.test", password: "password-123" },
      asResponse: true,
    });
    const cookie = sessionCookie(login);

    const res = await auth.api.verifyEmail({
      query: { token: theirs },
      headers: new Headers({ cookie }),
      asResponse: true,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").not.toContain("better-auth.session_token=");
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.email).toBe("me@example.test");
    expect(await isVerified("other@example.test")).toBe(true);
  });

  it("已註冊的 Email 再註冊一次：回應跟新帳號一樣，改寄通知給本人；不會多一個帳號", async () => {
    const auth = authWith(true);
    const first = await auth.api.signUpEmail({
      body: { email: "dup@example.test", password: "password-123", name: "Dup" },
    });
    await flush();
    sent.length = 0;
    const again = await auth.api.signUpEmail({
      body: { email: "DUP@example.test", password: "other-password-9", name: "Someone" },
    });
    expect(again.token).toBeNull();
    await flush();
    expect(Object.keys(again.user).sort()).toEqual(Object.keys(first.user).sort());
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "dup@example.test", subject: "Luné：這個 Email 已經註冊過" });
    expect(sent[0].text).toContain(`${ORIGIN}/forgot-password`);
    expect(await countUsers()).toBe(1);
  });

  it("寄信失敗不會讓註冊失敗（只記在日誌）", async () => {
    const broken: Mailer = {
      kind: "memory",
      async send() {
        throw new Error("smtp down");
      },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const auth = authWith(true, broken);
    const res = await auth.api.signUpEmail({
      body: { email: "down@example.test", password: "password-123", name: "Down" },
      asResponse: true,
    });
    expect(res.status).toBe(200);
    await flush();
    expect(await countUsers()).toBe(1);
    spy.mockRestore();
  });
});

describe("沒有要求驗證（預設）", () => {
  it("註冊直接登入，也寄一封驗證信；登入後可以重寄，同一個信箱寄太多次會回錯誤", async () => {
    const auth = authWith(false);
    const email = "soft@example.test";
    const res = await auth.api.signUpEmail({
      body: { email, password: "password-123", name: "Soft" },
      asResponse: true,
    });
    const headers = new Headers({ cookie: sessionCookie(res) });
    await flush();
    expect(sent).toHaveLength(1);

    // 設定頁「重寄驗證信」：在請求內等寄完，錯誤會傳回來
    for (let i = 0; i < MAIL_LIMITS.perRecipient.max - 1; i++) {
      await auth.api.sendVerificationEmail({ body: { email }, headers });
    }
    expect(sent).toHaveLength(MAIL_LIMITS.perRecipient.max);
    await expect(auth.api.sendVerificationEmail({ body: { email }, headers })).rejects.toBeInstanceOf(MailLimitError);
    expect(sent).toHaveLength(MAIL_LIMITS.perRecipient.max);
  });
});

describe("忘記密碼", () => {
  it("帳號不存在不寄信、回應一樣；用信裡的連結設新密碼後舊密碼失效、所有舊登入登出、連結不能再用", async () => {
    const auth = authWith(false);
    await auth.api.signUpEmail({ body: { email: "pw@example.test", password: "old-password-1", name: "Pw" } });
    const login = await auth.api.signInEmail({
      body: { email: "pw@example.test", password: "old-password-1" },
      asResponse: true,
    });
    const oldCookie = sessionCookie(login);
    await flush();
    sent.length = 0;

    const missing = await auth.api.requestPasswordReset({ body: { email: "nobody@example.test" } });
    const existing = await auth.api.requestPasswordReset({ body: { email: "pw@example.test" } });
    expect(missing).toEqual(existing);
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "pw@example.test", subject: "Luné：重設密碼" });
    const token = tokenFrom(sent[0], "/reset-password");

    await auth.api.resetPassword({ body: { newPassword: "new-password-2", token } });
    expect(await auth.api.getSession({ headers: new Headers({ cookie: oldCookie }) })).toBeNull();
    const oldPw = await auth.api.signInEmail({
      body: { email: "pw@example.test", password: "old-password-1" },
      asResponse: true,
    });
    expect(oldPw.status).toBe(401);
    const newPw = await auth.api.signInEmail({
      body: { email: "pw@example.test", password: "new-password-2" },
      asResponse: true,
    });
    expect(newPw.status).toBe(200);

    const reused = await auth.api.resetPassword({
      body: { newPassword: "third-password-3", token },
      asResponse: true,
    });
    expect(reused.status).toBe(400);
    expect((await reused.json()).code).toBe("INVALID_TOKEN");
  });

  it("沒有寄信服務：不開放重設密碼；重複註冊照舊直接告知", async () => {
    const auth = authWith(true, null);
    await auth.api.signUpEmail({ body: { email: "x@example.test", password: "password-123", name: "X" } });
    const reset = await auth.api.requestPasswordReset({ body: { email: "x@example.test" }, asResponse: true });
    expect(reset.status).toBe(400);
    const dup = await auth.api.signUpEmail({
      body: { email: "x@example.test", password: "password-123", name: "X" },
      asResponse: true,
    });
    expect(dup.status).toBe(422);
  });
});

describe("寄信額度", () => {
  it("同一個收件者一小時最多 5 封；被擋下的不占全站額度", async () => {
    const guarded = withMailLimits(db, mailer);
    const msg = (to: string): MailMessage => ({ to, subject: "s", text: "t" });
    for (let i = 0; i < MAIL_LIMITS.perRecipient.max; i++) await guarded.send(msg("a@example.test"));
    await expect(guarded.send(msg("A@example.test"))).rejects.toBeInstanceOf(MailLimitError);
    await guarded.send(msg("b@example.test"));
    expect(sent.map((m) => m.to)).toEqual([...Array(5).fill("a@example.test"), "b@example.test"]);
    const daily = rowsOf<{ count: number }>(
      await db.execute(sql`select count from lune.rate_limits where key = 'mail:daily'`),
    );
    expect(daily[0].count).toBe(6);
  });

  it("全站額度用完就不寄", async () => {
    await db.execute(
      sql`insert into lune.rate_limits (key, count, window_start) values ('mail:daily', ${MAIL_LIMITS.daily.max}, now())`,
    );
    const guarded = withMailLimits(db, mailer);
    await expect(guarded.send({ to: "c@example.test", subject: "s", text: "t" })).rejects.toBeInstanceOf(
      MailLimitError,
    );
    expect(sent).toHaveLength(0);
  });
});
