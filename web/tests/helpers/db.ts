import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createPGlite, type Db, openLocalDb } from "@/lib/db/local";
import { ensureFirstProfile, listProfiles } from "@/lib/services/profiles";

/** 記憶體內的 PGlite：跑全部 migration，跟正式 schema 相同（含 auth schema、RLS、btree_gist） */
export async function createTestDb(): Promise<Db> {
  return openLocalDb(createPGlite());
}

/** 直接在 auth.users 建一個使用者並建立第一個 Profile（不經過 Better Auth；測服務層與 RLS 用） */
export async function createUser(
  db: Db,
  name = randomUUID().slice(0, 8),
): Promise<{ userId: string; profileId: string }> {
  const userId = randomUUID();
  await db.execute(
    sql`insert into auth.users (id, name, email) values (${userId}, ${name}, ${`${name}@example.test`})`,
  );
  await ensureFirstProfile(db, userId, name);
  const [profile] = await listProfiles(db, userId);
  return { userId, profileId: profile.id };
}

/** 取出 drizzle execute 的 rows（PGlite 與 postgres.js 回傳形狀不同，統一處理） */
export function rowsOf<T>(result: unknown): T[] {
  const r = result as { rows?: T[] } | T[];
  return Array.isArray(r) ? r : (r.rows ?? []);
}

/** 預期資料庫層直接拒絕（RLS、權限或約束），並回傳錯誤訊息 */
export async function expectDbRejects(p: Promise<unknown>): Promise<string> {
  const error = await p.then(
    () => null,
    (e: unknown) => e,
  );
  if (error === null) throw new Error("預期資料庫拒絕，但成功了");
  const cause = (error as { cause?: { message?: string } }).cause;
  return cause?.message ?? (error as Error).message;
}
