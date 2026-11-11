"use server";

import { APIError } from "better-auth";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/better-auth";
import { LOCAL_USERS } from "@/lib/auth/local-users";
import { getSessionUser } from "@/lib/auth/session";
import { isLocalMode } from "@/lib/config";
import { PROFILE_COOKIE, setCurrentProfileCookie } from "@/lib/current-profile";
import { getDb } from "@/lib/db/client";
import { AppError, type FieldIssue, unauthorized } from "@/lib/errors";
import { deleteDailyLog, getDailyLog, saveDailyLog } from "@/lib/services/daily-logs";
import { allowAttempt, recordFailure, recordSuccess } from "@/lib/services/login-guard";
import { createPeriod, deletePeriod, endPeriod, startPeriod, updatePeriod } from "@/lib/services/periods";
import { createProfile, resolveCurrentProfile, setProfileArchived, updateProfile } from "@/lib/services/profiles";
import { clientIp } from "@/lib/services/rate-limit";
import type { DailyLog, Period, Profile } from "@/lib/types";
import { type Credentials, credentialsSchema } from "@/lib/validation/auth";

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
}

/** Better Auth 的錯誤碼 → 使用者看得懂的訊息；不洩漏帳號是否存在 */
function authErrorMessage(error: unknown, intent: "signin" | "signup"): string {
  if (error instanceof APIError) {
    const code = error.body?.code ?? "";
    if (intent === "signup" && /ALREADY_EXISTS/.test(code)) return "這個 Email 已經註冊過，請直接登入";
    if (intent === "signin" && isBadCredentials(error)) return "Email 或密碼不正確";
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
 * 登入／註冊。限流見 lib/services/login-guard.ts：IP 計所有嘗試；帳號只計失敗、成功就清掉同來源的紀錄。
 * 註冊時「Email 已註冊」會直接告知：沒有寄信驗證的流程時無法完全避免帳號枚舉，靠 IP 限流降低大量探測。
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
  if (!(await allowAttempt(db, ip, email))) return { error: TOO_MANY };
  const auth = await getAuth();
  try {
    if (intent === "signup") {
      const name = parsed.data.name?.trim() || email.split("@")[0];
      await auth.api.signUpEmail({ body: { email, password: parsed.data.password, name }, headers: requestHeaders });
    } else {
      await auth.api.signInEmail({ body: { email, password: parsed.data.password }, headers: requestHeaders });
    }
  } catch (error) {
    if (intent === "signin" && isBadCredentials(error)) await recordFailure(db, ip, email);
    return { error: authErrorMessage(error, intent) };
  }
  await recordSuccess(db, ip, email);
  redirect("/dashboard");
}

/** 本機示範模式：一鍵以示範使用者登入 */
export async function loginLocalAction(formData: FormData): Promise<void> {
  if (!isLocalMode()) redirect("/login");
  const user = LOCAL_USERS.find((u) => u.key === formData.get("user"));
  if (!user) redirect("/login");
  const requestHeaders = await headers();
  if (!(await allowAttempt(await getDb(), clientIp(requestHeaders), user.email))) redirect("/login");
  const auth = await getAuth();
  await auth.api.signInEmail({ body: { email: user.email, password: user.password }, headers: requestHeaders });
  redirect("/dashboard");
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
  if (!(await allowAttempt(db, ip, account))) return { error: TOO_MANY };
  const auth = await getAuth();
  try {
    await auth.api.deleteUser({ body: { password }, headers: requestHeaders });
  } catch (error) {
    if (isBadCredentials(error)) {
      await recordFailure(db, ip, account);
      return { error: "密碼不正確" };
    }
    logError(error);
    return { error: "刪除失敗，請稍後再試" };
  }
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
