import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { count, eq, sql } from "drizzle-orm";
import { LOCAL_USERS } from "@/lib/auth/local-users";
import { authEnv, isLocalMode } from "@/lib/config";
import { authSchema, users } from "@/lib/db/auth-schema";
import { type Db, getDb } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { withService } from "@/lib/db/with-user";
import { ensureFirstProfile } from "@/lib/services/profiles";
import { seedSampleData } from "@/lib/services/sample";

/**
 * Better Auth：Email＋密碼。
 * - 使用者表在 Postgres 的 auth schema（db/migrations/20261111000000_auth.sql），id 是 uuid。
 * - session 存資料庫，cookie 只放 token（httpOnly、SameSite=Lax、正式環境 Secure）。
 * - 沒有對外的 HTTP handler：登入／註冊／登出全部經由 Server Action 呼叫 auth.api.*，
 *   限流由 Server Action 自己用資料庫計數（src/lib/services/rate-limit.ts），
 *   所以這裡關掉 Better Auth 內建、只作用在 handler 上的 rateLimit。
 * - Email 驗證先不強制（沒有寄信服務）。
 * - 註冊成功自動建立第一個 Profile（名稱用註冊時的名字）。
 * - 本機示範模式啟動時會建立兩位示範使用者，登入頁可一鍵登入。
 */
export function createAuth(db: Db) {
  const env = authEnv();
  return betterAuth({
    appName: "Luné",
    secret: env.secret,
    baseURL: env.baseURL,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema, transaction: true }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 72,
      requireEmailVerification: false,
      autoSignIn: true,
    },
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
    tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1),
  );
  return row?.id ?? null;
}

async function countProfiles(db: Db, userId: string): Promise<number> {
  const [row] = await withService(db, (tx) =>
    tx.select({ n: count() }).from(profiles).where(eq(profiles.userId, userId)),
  );
  return row?.n ?? 0;
}
