import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { users } from "@/lib/db/auth-schema";
import type { Db } from "@/lib/db/local";
import { profiles } from "@/lib/db/schema";
import { isUuid, type Tx, withService, withUser } from "@/lib/db/with-user";
import { AppError, issuesFromZod, validationFailed } from "@/lib/errors";
import { requireProfile } from "@/lib/services/access";
import { toProfile } from "@/lib/services/mappers";
import type { Profile } from "@/lib/types";
import { profileInputSchema, profileUpdateSchema } from "@/lib/validation/profile-schema";

/** 每個帳號同時使用中的 Profile 上限，以及含封存的總數上限（避免無限建立） */
export const MAX_ACTIVE_PROFILES = 10;
export const MAX_TOTAL_PROFILES = 30;

/** 同一個帳號的 Profile 數量檢查要序列化，避免同時新增超過上限 */
async function lockUserProfiles(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lune:profiles:${userId}`}))`);
}

function fallbackName(name: string | null | undefined): string {
  return name?.trim().slice(0, 30) || "我";
}

/**
 * 帳號沒有任何使用中的 Profile 時建立一個（名稱用註冊時的名字）。
 * 註冊成功由 Better Auth 的 hook 呼叫；若當時失敗，resolveCurrentProfile 會補建。
 * 以伺服器身分執行：此時還沒有可用的 RLS 身分。
 */
export async function ensureFirstProfile(db: Db, userId: string, name: string | null): Promise<void> {
  await withService(db, async (tx) => {
    await lockUserProfiles(tx, userId);
    const [{ n }] = await tx
      .select({ n: count() })
      .from(profiles)
      .where(and(eq(profiles.userId, userId), isNull(profiles.archivedAt)));
    if (n > 0) return;
    await tx.insert(profiles).values({ userId, displayName: fallbackName(name) });
  });
}

export async function listProfiles(
  db: Db,
  userId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<Profile[]> {
  const rows = await withUser(db, userId, (tx) =>
    tx
      .select()
      .from(profiles)
      .where(
        includeArchived ? eq(profiles.userId, userId) : and(eq(profiles.userId, userId), isNull(profiles.archivedAt)),
      )
      .orderBy(asc(profiles.createdAt), asc(profiles.id)),
  );
  return rows.map(toProfile);
}

async function checkLimits(tx: Tx, userId: string, { adding }: { adding: "new" | "unarchive" }): Promise<void> {
  const rows = await tx
    .select({ archived: sql<boolean>`${profiles.archivedAt} is not null`, n: count() })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .groupBy(sql`${profiles.archivedAt} is not null`);
  const active = rows.find((r) => !r.archived)?.n ?? 0;
  const total = rows.reduce((s, r) => s + r.n, 0);
  if (active >= MAX_ACTIVE_PROFILES) {
    throw new AppError("profile_limit", `最多同時使用 ${MAX_ACTIVE_PROFILES} 個 Profile，請先封存不用的`, 409);
  }
  if (adding === "new" && total >= MAX_TOTAL_PROFILES) {
    throw new AppError("profile_limit", `Profile 總數（含封存）最多 ${MAX_TOTAL_PROFILES} 個`, 409);
  }
}

export async function createProfile(db: Db, userId: string, input: unknown): Promise<Profile> {
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const v = parsed.data;
  return withUser(db, userId, async (tx) => {
    await lockUserProfiles(tx, userId);
    await checkLimits(tx, userId, { adding: "new" });
    const [row] = await tx
      .insert(profiles)
      .values({
        userId,
        displayName: v.displayName,
        avatarColor: v.avatarColor ?? null,
        defaultCycleLength: v.defaultCycleLength ?? null,
        defaultPeriodLength: v.defaultPeriodLength ?? null,
        predictionEnabled: v.predictionEnabled ?? true,
      })
      .returning();
    return toProfile(row);
  });
}

export async function updateProfile(db: Db, userId: string, profileId: unknown, input: unknown): Promise<Profile> {
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const v = parsed.data;
  return withUser(db, userId, async (tx) => {
    const current = await requireProfile(tx, userId, profileId);
    const [row] = await tx
      .update(profiles)
      .set({
        ...(v.displayName !== undefined ? { displayName: v.displayName } : {}),
        ...(v.avatarColor !== undefined ? { avatarColor: v.avatarColor } : {}),
        ...(v.defaultCycleLength !== undefined ? { defaultCycleLength: v.defaultCycleLength } : {}),
        ...(v.defaultPeriodLength !== undefined ? { defaultPeriodLength: v.defaultPeriodLength } : {}),
        ...(v.predictionEnabled !== undefined ? { predictionEnabled: v.predictionEnabled } : {}),
      })
      .where(and(eq(profiles.id, current.id), eq(profiles.userId, userId)))
      .returning();
    return toProfile(row);
  });
}

/** 封存／取消封存；封存不刪資料。至少要留一個使用中的 Profile */
export async function setProfileArchived(
  db: Db,
  userId: string,
  profileId: unknown,
  archived: boolean,
): Promise<Profile> {
  return withUser(db, userId, async (tx) => {
    await lockUserProfiles(tx, userId);
    const current = await requireProfile(tx, userId, profileId);
    if (archived === (current.archivedAt !== null)) return toProfile(current);
    if (archived) {
      const [{ n }] = await tx
        .select({ n: count() })
        .from(profiles)
        .where(and(eq(profiles.userId, userId), isNull(profiles.archivedAt)));
      if (n <= 1) throw new AppError("last_profile", "至少要保留一個使用中的 Profile", 409);
    } else {
      await checkLimits(tx, userId, { adding: "unarchive" });
    }
    const [row] = await tx
      .update(profiles)
      .set({ archivedAt: archived ? sql`now()` : null })
      .where(and(eq(profiles.id, current.id), eq(profiles.userId, userId)))
      .returning();
    return toProfile(row);
  });
}

/**
 * 目前的 Profile：偏好的 ID（來自 cookie）屬於這個使用者且未封存就用它，否則用第一個未封存的。
 * 完全沒有 Profile（註冊時建立失敗）就補建一個。cookie 只是偏好，不是權限：每次都在這裡驗證歸屬。
 */
export async function resolveCurrentProfile(db: Db, userId: string, preferredId: unknown): Promise<Profile> {
  const pick = async (): Promise<Profile | null> => {
    const list = await listProfiles(db, userId);
    return (isUuid(preferredId) ? list.find((p) => p.id === preferredId) : undefined) ?? list[0] ?? null;
  };
  const found = await pick();
  if (found) return found;
  const [user] = await withService(db, (tx) =>
    tx.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
  );
  if (!user) throw new AppError("unauthorized", "請先登入", 401);
  await ensureFirstProfile(db, userId, user.name);
  const created = await pick();
  if (!created) throw new Error("無法建立 Profile");
  return created;
}
