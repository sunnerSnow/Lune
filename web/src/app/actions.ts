"use server";

import { APIError } from "better-auth";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/better-auth";
import { LOCAL_USERS } from "@/lib/auth/local-users";
import { getSessionUser } from "@/lib/auth/session";
import { isLocalMode, mailReady, requireEmailVerification } from "@/lib/config";
import { PROFILE_COOKIE, setCurrentProfileCookie } from "@/lib/current-profile";
import { getDb } from "@/lib/db/client";
import { AppError, type FieldIssue, unauthorized } from "@/lib/errors";
import { deleteDailyLog, getDailyLog, saveDailyLog } from "@/lib/services/daily-logs";
import { attemptAborted, attemptSucceeded, reserveAttempt } from "@/lib/services/login-guard";
import { createPeriod, deletePeriod, endPeriod, startPeriod, updatePeriod } from "@/lib/services/periods";
import { createProfile, resolveCurrentProfile, setProfileArchived, updateProfile } from "@/lib/services/profiles";
import { clientIp, consumeRateLimit } from "@/lib/services/rate-limit";
import type { DailyLog, Period, Profile } from "@/lib/types";
import {
  type Credentials,
  credentialsSchema,
  type ForgotPasswordInput,
  forgotPasswordSchema,
  type ResetPasswordInput,
  resetPasswordSchema,
} from "@/lib/validation/auth";

/**
 * Server Actions 都是公開的 POST 端點：每一個都自己檢查登入，輸入一律交給服務層驗證。
 * 「今天」由前端依使用者時區傳入，服務層只確認合理範圍。
 * 回傳值一律是可序列化的 ActionResult。錯誤日誌只記錯誤碼與第一行訊息，不記任何健康紀錄內容。
 */
export type ActionError = { code: string; message: string; issues?: FieldIssue[] };
export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: ActionError };

function logError(error: unknown): void {
  const e = error as { name?: string; cause?: { code?: string }; code?: string };
  const code = e?.cause?.code ?? e?.code ?? "";
  console.error(`[lune] ${e?.name ?? "Error"}${code ? ` ${code}` : ""}`);
}

async function run<T>(fn: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await getSessionUser();
    if (!user) throw unauthorized();
    return { ok: true, value: await fn(user.id) };
  } catch (error) {
    if (error instanceof AppError) {
      return {
        ok: false,
        error: { code: error.code, message: error.message, ...(error.issues.length ? { issues: error.issues } : {}) },
      };
    }
    logError(error);
    return { ok: false, error: { code: "internal_error", message: "系統發生錯誤，請稍後再試" } };
  }
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** 切換目前的 Profile：先驗證歸屬，再寫 cookie */
export async function switchProfileAction(profileId: string): Promise<ActionResult<Profile>> {
  return run(async (userId) => {
    const profile = await resolveCurrentProfile(await getDb(), userId, profileId);
    if (profile.id !== profileId) throw new AppError("not_found", "找不到這個 Profile，或你沒有權限存取", 404);
    await setCurrentProfileCookie(profile.id);
    return profile;
  });
}

export async function createProfileAction(input: unknown): Promise<ActionResult<Profile>> {
  return run(async (userId) => createProfile(await getDb(), userId, input));
}

export async function updateProfileAction(profileId: string, input: unknown): Promise<ActionResult<Profile>> {
  return run(async (userId) => updateProfile(await getDb(), userId, profileId, input));
}

export async function setProfileArchivedAction(profileId: string, archived: boolean): Promise<ActionResult<Profile>> {
  return run(async (userId) => setProfileArchived(await getDb(), userId, profileId, archived === true));
}

// ---------------------------------------------------------------------------
// 經期
// ---------------------------------------------------------------------------

export async function startPeriodAction(
  profileId: string,
  input: unknown,
  today: string,
): Promise<ActionResult<Period>> {
  return run(async (userId) => startPeriod(await getDb(), userId, profileId, input, today));
}

export async function endPeriodAction(profileId: string, input: unknown, today: string): Promise<ActionResult<Period>> {
  return run(async (userId) => endPeriod(await getDb(), userId, profileId, input, today));
}

export async function createPeriodAction(
  profileId: string,
  input: unknown,
  today: string,
): Promise<ActionResult<Period>> {
  return run(async (userId) => createPeriod(await getDb(), userId, profileId, input, today));
}

export async function updatePeriodAction(
  periodId: string,
  input: unknown,
  today: string,
): Promise<ActionResult<Period>> {
  return run(async (userId) => updatePeriod(await getDb(), userId, periodId, input, today));
}

export async function deletePeriodAction(periodId: string): Promise<ActionResult<null>> {
  return run(async (userId) => {
    await deletePeriod(await getDb(), userId, periodId);
    return null;
  });
}

// ---------------------------------------------------------------------------
// 每日紀錄
// ---------------------------------------------------------------------------

export async function saveDailyLogAction(
  profileId: string,
  input: unknown,
  today: string,
): Promise<ActionResult<DailyLog | null>> {
  return run(async (userId) => saveDailyLog(await getDb(), userId, profileId, input, today));
}

/** 記錄表單換日期時載入那天既有的紀錄，避免無意間覆蓋 */
export async function getDailyLogAction(profileId: string, date: string): Promise<ActionResult<DailyLog | null>> {
  return run(async (userId) => getDailyLog(await getDb(), userId, profileId, date));
}

export async function deleteDailyLogAction(profileId: string, date: string): Promise<ActionResult<null>> {
  return run(async (userId) => {
    await deleteDailyLog(await getDb(), userId, profileId, date);
    return null;
  });
}

// ---------------------------------------------------------------------------
// 登入（Better Auth；nextCookies plugin 會把 session cookie 寫進回應）
// ---------------------------------------------------------------------------

export interface AuthState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** 動作完成（例如已寄出重設密碼信），表單換成完成畫面 */
  done?: boolean;
}

/** Better Auth 的錯誤碼 → 使用者看得懂的訊息；不洩漏帳號是否存在 */
function authErrorMessage(error: unknown, intent: "signin" | "signup"): string {
  if (error instanceof APIError) {
    const code = error.body?.code ?? "";
    // 只有沒開「要求驗證」時才會走到這裡；開了之後重複註冊會回一般的「請收信」
    if (intent === "signup" && /ALREADY_EXISTS/.test(code)) return "這個 Email 已經註冊過，請直接登入";
    if (intent === "signin" && isBadCredentials(error)) return "Email 或密碼不正確";
    if (intent === "signin" && /EMAIL_NOT_VERIFIED/.test(code)) {
      return "這個帳號還沒完成 Email 驗證。我們剛重新寄出驗證信，請到信箱點連結（也看看垃圾郵件匣）";
    }
    if (/PASSWORD_TOO_SHORT|PASSWORD_TOO_LONG/.test(code)) return "密碼長度需為 8–72 個字元";
    if (error.status === "TOO_MANY_REQUESTS") return "嘗試次數太多，請稍後再試";
    logError(error);
    return intent === "signup" ? "註冊失敗，請稍後再試" : "登入失敗，請稍後再試";
  }
  logError(error);
  return "系統發生錯誤，請稍後再試";
}

const TOO_MANY = "嘗試次數太多，請 15 分鐘後再試";

/** 密碼錯誤（要計入失敗次數）；帳號不存在也回同一種錯誤，不洩漏帳號是否存在 */
function isBadCredentials(error: unknown): boolean {
  if (!(error instanceof APIError)) return false;
  const code = error.body?.code ?? "";
  return /INVALID_EMAIL_OR_PASSWORD|USER_NOT_FOUND|INVALID_PASSWORD/.test(code) || error.status === "UNAUTHORIZED";
}

/**
 * 登入／註冊。限流見 lib/services/login-guard.ts：嘗試前先預記一次失敗（原子操作），成功才清掉／退回。
 * - 要求驗證 Email 時：註冊一律導向「請收信」（Email 已存在時 Better Auth 回同樣的結果，改寄通知給本人），
 *   不會透露帳號是否存在；這種註冊不清掉預記的次數，同一個來源 15 分鐘最多 5 次，避免拿來灌別人信箱。
 * - 沒有要求驗證時：「Email 已註冊」會直接告知，靠限流降低大量探測。
 */
export async function loginAction(intent: "signin" | "signup", input: Credentials): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0].message,
      fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
    };
  }
  const requestHeaders = await headers();
  const db = await getDb();
  const ip = clientIp(requestHeaders);
  const email = parsed.data.email;
  // 註冊不計帳號合計：別人拿你的 Email 一直註冊，不該鎖住你的登入
  const opts = { countAccount: intent === "signin" };
  if (!(await reserveAttempt(db, ip, email, opts))) return { error: TOO_MANY };
  const auth = await getAuth();
  // redirect() 靠丟例外運作，不能放在 try 裡
  let checkMail = false;
  try {
    if (intent === "signup") {
      const name = parsed.data.name?.trim() || email.split("@")[0];
      const result = await auth.api.signUpEmail({
        body: { email, password: parsed.data.password, name },
        headers: requestHeaders,
      });
      // 要求驗證 Email 時不會建立 session（token 是 null）
      checkMail = !result.token;
    } else {
      await auth.api.signInEmail({ body: { email, password: parsed.data.password }, headers: requestHeaders });
    }
  } catch (error) {
    // 密碼錯誤（登入）或 Email 已註冊（註冊）：維持預先記的失敗；其他錯誤全部退回
    const expected =
      intent === "signin"
        ? isBadCredentials(error)
        : error instanceof APIError && /ALREADY_EXISTS/.test(error.body?.code ?? "");
    if (!expected) await attemptAborted(db, ip, email, opts).catch(logError);
    return { error: authErrorMessage(error, intent) };
  }
  if (checkMail) redirect("/login?notice=check-mail");
  // 登入已經成功（cookie 已寫入）：清理計數失敗也照樣進首頁
  await attemptSucceeded(db, ip, email, opts).catch(logError);
  redirect("/dashboard");
}

/** 本機示範模式：一鍵以示範使用者登入 */
export async function loginLocalAction(formData: FormData): Promise<void> {
  if (!isLocalMode()) redirect("/login");
  const user = LOCAL_USERS.find((u) => u.key === formData.get("user"));
  if (!user) redirect("/login");
  const requestHeaders = await headers();
  const db = await getDb();
  const ip = clientIp(requestHeaders);
  if (!(await reserveAttempt(db, ip, user.email))) redirect("/login");
  const auth = await getAuth();
  try {
    await auth.api.signInEmail({ body: { email: user.email, password: user.password }, headers: requestHeaders });
  } catch (error) {
    logError(error);
    await attemptAborted(db, ip, user.email).catch(logError);
    redirect("/login");
  }
  await attemptSucceeded(db, ip, user.email).catch(logError);
  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// 忘記密碼／重設密碼／Email 驗證（要有寄信服務；token 由這裡消耗，不走 Better Auth 的 HTTP handler）
// ---------------------------------------------------------------------------

const TRY_LATER = "嘗試次數太多，請 10 分鐘後再試";

/**
 * 寄重設密碼信。不論帳號存不存在都回同樣的結果；信在回應送出後才寄，回應時間也一樣。
 * 限流：每個 IP 每 10 分鐘 10 次；同一個收件者每小時最多 5 封由寄信器統一擋（lib/mail.ts）。
 */
export async function requestPasswordResetAction(input: ForgotPasswordInput): Promise<AuthState> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0].message;
    return { error: message, fieldErrors: { email: message } };
  }
  if (!mailReady()) return { error: "目前還沒有開放寄信，暫時無法重設密碼" };
  const requestHeaders = await headers();
  if (!(await consumeRateLimit(await getDb(), `reset:ip:${clientIp(requestHeaders)}`, 10, 600))) {
    return { error: TRY_LATER };
  }
  const auth = await getAuth();
  try {
    await auth.api.requestPasswordReset({ body: { email: parsed.data.email.toLowerCase() }, headers: requestHeaders });
  } catch (error) {
    // 不告訴使用者帳號是否存在；留在日誌
    logError(error);
  }
  return { done: true };
}

/** 用信裡的 token 設定新密碼；成功後所有舊的登入都失效，回登入頁 */
export async function resetPasswordAction(input: ResetPasswordInput): Promise<AuthState> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0].message,
      fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
    };
  }
  const requestHeaders = await headers();
  if (!(await consumeRateLimit(await getDb(), `reset:confirm:${clientIp(requestHeaders)}`, 10, 600))) {
    return { error: TRY_LATER };
  }
  const auth = await getAuth();
  try {
    await auth.api.resetPassword({
      body: { newPassword: parsed.data.password, token: parsed.data.token },
      headers: requestHeaders,
    });
  } catch (error) {
    const code = error instanceof APIError ? (error.body?.code ?? "") : "";
    if (/INVALID_TOKEN/.test(code)) return { error: "這個連結已經失效或用過了，請重新申請重設密碼" };
    if (/PASSWORD_TOO_SHORT|PASSWORD_TOO_LONG/.test(code)) return { error: "密碼長度要在 8–72 個字元之間" };
    logError(error);
    return { error: "系統發生錯誤，請稍後再試" };
  }
  redirect("/login?notice=reset");
}

/**
 * 用信裡的 token 完成 Email 驗證。不會登入、也不改動目前的登入（原因見 better-auth.ts 的 autoSignInAfterVerification）；
 * 已經驗證過的 token 也回完成。
 */
export async function verifyEmailAction(token: string): Promise<AuthState> {
  if (typeof token !== "string" || !token || token.length > 4000) return { error: "這個連結不完整" };
  const requestHeaders = await headers();
  if (!(await consumeRateLimit(await getDb(), `verify:ip:${clientIp(requestHeaders)}`, 20, 600))) {
    return { error: TRY_LATER };
  }
  const auth = await getAuth();
  try {
    await auth.api.verifyEmail({ query: { token }, headers: requestHeaders });
  } catch (error) {
    if (error instanceof APIError) {
      return {
        error: requireEmailVerification()
          ? "這個連結已經失效。再登入一次，就會收到新的驗證信"
          : "這個連結已經失效。登入後可以在設定頁重寄驗證信",
      };
    }
    logError(error);
    return { error: "系統發生錯誤，請稍後再試" };
  }
  return { done: true };
}

/** 已登入但還沒驗證的使用者重寄驗證信（設定頁）；每位使用者每小時 3 次 */
export async function resendVerificationAction(): Promise<AuthState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.email) return { error: "這個帳號沒有 Email" };
  if (user.emailVerified) return { done: true };
  if (!mailReady()) return { error: "目前還沒有開放寄信" };
  const requestHeaders = await headers();
  if (!(await consumeRateLimit(await getDb(), `verify:resend:${user.id}`, 3, 3600))) {
    return { error: "已經寄過幾封了，請一小時後再試" };
  }
  const auth = await getAuth();
  try {
    await auth.api.sendVerificationEmail({ body: { email: user.email }, headers: requestHeaders });
  } catch (error) {
    logError(error);
    return { error: "寄送失敗，請稍後再試" };
  }
  return { done: true };
}

/**
 * 刪除帳號：一定要重新輸入密碼（不接受只靠「剛登入」的 session），
 * 刪除 auth.users 後由外鍵連帶刪除所有 Profile、經期與每日紀錄。密碼錯誤計入失敗次數。
 */
export async function deleteAccountAction(password: string): Promise<{ error?: string }> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (typeof password !== "string" || password.length === 0) return { error: "請輸入密碼" };
  if (password.length > 72) return { error: "密碼不正確" };
  const requestHeaders = await headers();
  const db = await getDb();
  const ip = clientIp(requestHeaders);
  const account = `delete:${user.id}`;
  if (!(await reserveAttempt(db, ip, account))) return { error: TOO_MANY };
  const auth = await getAuth();
  try {
    await auth.api.deleteUser({ body: { password }, headers: requestHeaders });
  } catch (error) {
    // 只有確定是密碼錯誤才說「密碼不正確」並維持失敗計數；
    // 其他錯誤（例如 session 剛好失效）不誤導使用者，預先記的次數也退回
    const code = error instanceof APIError ? (error.body?.code ?? "") : "";
    if (/INVALID_PASSWORD/.test(code)) return { error: "密碼不正確" };
    logError(error);
    await attemptAborted(db, ip, account).catch(logError);
    return { error: "刪除失敗，請重新登入後再試" };
  }
  await attemptSucceeded(db, ip, account).catch(logError);
  const jar = await cookies();
  jar.delete(PROFILE_COOKIE);
  redirect("/login?deleted=1");
}

export async function logoutAction(): Promise<void> {
  const auth = await getAuth();
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (error) {
    // 沒有 session 也算登出成功
    if (!(error instanceof APIError)) logError(error);
  }
  redirect("/login");
}
