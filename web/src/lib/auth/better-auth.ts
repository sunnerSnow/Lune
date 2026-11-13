import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { count, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { LOCAL_USERS } from "@/lib/auth/local-users";
import { appOrigin, authEnv, isLocalMode, mailReady, requireEmailVerification } from "@/lib/config";
import { authSchema, users } from "@/lib/db/auth-schema";
import { type Db, getDb } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { withService } from "@/lib/db/with-user";
import {
  createMailer,
  emailVerificationMail,
  existingAccountMail,
  type Mailer,
  passwordResetMail,
  tokenLink,
  withMailLimits,
} from "@/lib/mail";
import { ensureFirstProfile } from "@/lib/services/profiles";
import { seedSampleData } from "@/lib/services/sample";

/**
 * Better Auth：Email＋密碼。
 * - 使用者表在 Postgres 的 auth schema（db/migrations/20261111000000_auth.sql），id 是 uuid。
 * - session 存資料庫，cookie 只放 token（httpOnly、SameSite=Lax、正式環境 Secure）。
 * - 沒有對外的 HTTP handler：登入／註冊／登出全部經由 Server Action 呼叫 auth.api.*，
 *   限流由 Server Action 自己用資料庫計數（src/lib/services/rate-limit.ts），
 *   所以這裡關掉 Better Auth 內建、只作用在 handler 上的 rateLimit。
 * - 寄信（src/lib/mail.ts，Gmail）：有寄信服務才開放 Email 驗證與忘記密碼。
 *   信裡的連結自己組（appOrigin()/verify-email?token=…、/reset-password?token=…），
 *   不用 Better Auth 預設的 /api/auth/... 連結（沒有掛 HTTP handler）；
 *   token 由頁面上的按鈕送進 Server Action 消耗，信箱的連結預覽不會把 token 用掉。
 * - 信在回應送出後才寄（next/server 的 after()）：帳號存不存在，回應時間都一樣，
 *   也不用讓使用者等 SMTP。寄信失敗只記在日誌。
 * - requireEmailVerification 預設關閉，由 AUTH_REQUIRE_EMAIL_VERIFICATION=1 開啟（既有帳號登入時會收到驗證信）。
 *   開啟後，已註冊的 Email 再註冊一次也回「請收信」，改寄通知給本人，註冊頁不會透露帳號是否存在。
 * - 註冊成功自動建立第一個 Profile（名稱用註冊時的名字）。
 * - 本機示範模式啟動時會建立兩位示範使用者，登入頁可一鍵登入。
 */
export interface AuthDeps {
  /** 測試用：換掉寄信器（null 表示沒有寄信服務） */
  mailer?: Mailer | null;
  /** 測試用：覆寫是否要求驗證 Email */
  requireVerification?: boolean;
  /**
   * 測試用：背景工作（寄信）怎麼跑。一定要是背景：註冊整段在資料庫交易裡，寄信前的額度檢查要另外查資料庫，
   * 在交易內等它會跟交易搶連線（PGlite 只有一條連線，會互等到逾時）。
   */
  background?: (task: Promise<unknown>) => void;
}

/** 在請求結束後才跑（Vercel 上會延長函式壽命直到跑完）；不在請求內（例如啟動時建示範帳號）就直接放著跑 */
function runAfterResponse(task: Promise<unknown>): void {
  const settled = task.catch(() => {});
  try {
    after(() => settled);
  } catch {
    // 不在請求範圍內：Promise 已經在跑，不用額外處理
  }
}

export function createAuth(db: Db, deps: AuthDeps = {}) {
  const env = authEnv();
  const base = deps.mailer === undefined ? (mailReady() ? createMailer() : null) : deps.mailer;
  const mailer = base ? withMailLimits(db, base) : null;
  const requireVerification = mailer ? (deps.requireVerification ?? requireEmailVerification()) : false;
  const background = deps.background ?? runAfterResponse;
  return betterAuth({
    appName: "Luné",
    secret: env.secret,
    baseURL: env.baseURL,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema, transaction: true }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 72,
      requireEmailVerification: requireVerification,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: 60 * 30,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: mailer
        ? async ({ user, token }) => {
            await mailer.send(passwordResetMail(user.email, tokenLink(appOrigin(), "/reset-password", token)));
          }
        : undefined,
      onExistingUserSignUp: mailer
        ? async ({ user }) => {
            await mailer.send(existingAccountMail(user.email, appOrigin()));
          }
        : undefined,
    },
    emailVerification: mailer
      ? {
          sendOnSignUp: true,
          // 要求驗證時，未驗證的帳號登入（密碼正確）會再寄一封；登入頁的錯誤訊息就是這樣說的
          sendOnSignIn: true,
          // 驗證只證明「收得到信」，不證明知道密碼：自動登入的話，有人先用你的 Email 註冊並設好密碼，
          // 你點了驗證信就會登入他的帳號、在裡面記錄（他之後用密碼就能看）；別人的驗證連結也能把你的登入換成他的帳號。
          // 所以驗證完一律要自己登入；不知道密碼的人只能重設密碼，重設會讓所有舊的登入失效。
          autoSignInAfterVerification: false,
          expiresIn: 60 * 60 * 24,
          sendVerificationEmail: async ({ user, token }) => {
            await mailer.send(emailVerificationMail(user.email, tokenLink(appOrigin(), "/verify-email", token)));
          },
        }
      : undefined,
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: false },
    // 刪除帳號：Server Action 一定帶密碼呼叫（見 deleteAccountAction）；外鍵會連帶刪除所有紀錄
    user: { deleteUser: { enabled: true } },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await ensureFirstProfile(db, user.id, user.name ?? null);
          },
        },
      },
    },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: process.env.NODE_ENV === "production" && !isLocalMode(),
      backgroundTasks: { handler: background },
    },
    // Server Action 裡呼叫 auth.api.* 時自動把 Set-Cookie 寫進回應（要放在 plugins 最後）
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const cache = globalThis as unknown as { __luneAuth?: Promise<Auth> };

export function getAuth(): Promise<Auth> {
  cache.__luneAuth ??= (async () => {
    const db = await getDb();
    const auth = createAuth(db);
    if (isLocalMode()) await ensureLocalUsers(auth, db);
    return auth;
  })().catch((error) => {
    cache.__luneAuth = undefined;
    throw error;
  });
  return cache.__luneAuth;
}

/**
 * 本機示範模式：確保兩位示範使用者存在（密碼固定，只在本機用）；A 要有範例資料。
 * 範例資料在單一交易內寫入（含第二個 Profile「媽媽」），所以「只有一個 Profile」＝上次播種沒完成，這次補上。
 */
export async function ensureLocalUsers(auth: Auth, db: Db): Promise<void> {
  for (const u of LOCAL_USERS) {
    let userId: string | null = null;
    try {
      userId = (await auth.api.signUpEmail({ body: { email: u.email, password: u.password, name: u.label } })).user.id;
    } catch (error) {
      // 已存在就略過（USER_ALREADY_EXISTS）；其他錯誤丟出
      const code = (error as { body?: { code?: string } })?.body?.code ?? "";
      if (!/ALREADY_EXISTS/.test(code)) throw error;
    }
    if (!u.sample) continue;
    userId ??= await findUserIdByEmail(db, u.email);
    if (userId && (await countProfiles(db, userId)) < 2) await seedSampleData(db, userId);
  }
}

async function findUserIdByEmail(db: Db, email: string): Promise<string | null> {
  const [row] = await withService(db, (tx) =>
    tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
      .limit(1),
  );
  return row?.id ?? null;
}

async function countProfiles(db: Db, userId: string): Promise<number> {
  const [row] = await withService(db, (tx) =>
    tx.select({ n: count() }).from(profiles).where(eq(profiles.userId, userId)),
  );
  return row?.n ?? 0;
}
