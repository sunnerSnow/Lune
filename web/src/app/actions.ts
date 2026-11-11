"use server";

import { APIError } from "better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/better-auth";
import { LOCAL_USERS } from "@/lib/auth/local-users";
import { getSessionUser } from "@/lib/auth/session";
import { isLocalMode } from "@/lib/config";
import { setCurrentProfileCookie } from "@/lib/current-profile";
import { getDb } from "@/lib/db/client";
import { AppError, type FieldIssue, unauthorized } from "@/lib/errors";
import { deleteDailyLog, getDailyLog, saveDailyLog } from "@/lib/services/daily-logs";
import { createPeriod, deletePeriod, endPeriod, startPeriod, updatePeriod } from "@/lib/services/periods";
import { createProfile, resolveCurrentProfile, setProfileArchived, updateProfile } from "@/lib/services/profiles";
import { clientIp, consumeRateLimit } from "@/lib/services/rate-limit";
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
    if (
      intent === "signin" &&
      (/INVALID_EMAIL_OR_PASSWORD|USER_NOT_FOUND|INVALID_PASSWORD/.test(code) || error.status === "UNAUTHORIZED")
    ) {
      return "Email 或密碼不正確";
    }
    if (/PASSWORD_TOO_SHORT|PASSWORD_TOO_LONG/.test(code)) return "密碼長度需為 8–72 個字元";
    if (error.status === "TOO_MANY_REQUESTS") return "嘗試次數太多，請稍後再試";
    logError(error);
    return intent === "signup" ? "註冊失敗，請稍後再試" : "登入失敗，請稍後再試";
  }
  logError(error);
  return "系統發生錯誤，請稍後再試";
}

/** 限流：每個 IP 每 10 分鐘 30 次、每個 Email 每 15 分鐘 10 次（登入與註冊合計；失敗也算） */
async function allowLoginAttempt(requestHeaders: Headers, email: string): Promise<boolean> {
  const db = await getDb();
  const ipOk = await consumeRateLimit(db, `login:ip:${clientIp(requestHeaders)}`, 30, 600);
  const emailOk = await consumeRateLimit(db, `login:email:${email.toLowerCase()}`, 10, 900);
  return ipOk && emailOk;
}

export async function loginAction(intent: "signin" | "signup", input: Credentials): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0].message,
      fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
    };
  }
  const requestHeaders = await headers();
  if (!(await allowLoginAttempt(requestHeaders, parsed.data.email))) return { error: "嘗試次數太多，請 10 分鐘後再試" };
  const auth = await getAuth();
  try {
    if (intent === "signup") {
      const name = parsed.data.name?.trim() || parsed.data.email.split("@")[0];
      await auth.api.signUpEmail({
        body: { email: parsed.data.email, password: parsed.data.password, name },
        headers: requestHeaders,
      });
    } else {
      await auth.api.signInEmail({
        body: { email: parsed.data.email, password: parsed.data.password },
        headers: requestHeaders,
      });
    }
  } catch (error) {
    return { error: authErrorMessage(error, intent) };
  }
  redirect("/dashboard");
}

/** 本機示範模式：一鍵以示範使用者登入 */
export async function loginLocalAction(formData: FormData): Promise<void> {
  if (!isLocalMode()) redirect("/login");
  const user = LOCAL_USERS.find((u) => u.key === formData.get("user"));
  if (!user) redirect("/login");
  const requestHeaders = await headers();
  if (!(await allowLoginAttempt(requestHeaders, user.email))) redirect("/login");
  const auth = await getAuth();
  await auth.api.signInEmail({ body: { email: user.email, password: user.password }, headers: requestHeaders });
  redirect("/dashboard");
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
