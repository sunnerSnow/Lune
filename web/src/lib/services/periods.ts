import { and, asc, eq, isNull } from "drizzle-orm";
import { conflictMessage, findPeriodConflict } from "@/lib/cycle/period-rules";
import { diffDays } from "@/lib/date/date-utils";
import type { Db } from "@/lib/db/local";
import { isExclusionViolation, isUniqueViolation } from "@/lib/db/pg-errors";
import { periods } from "@/lib/db/schema";
import { isUuid, type Tx, withUser } from "@/lib/db/with-user";
import { AppError, issuesFromZod, notFound, validationFailed } from "@/lib/errors";
import { requireProfile, requireToday } from "@/lib/services/access";
import { toPeriod } from "@/lib/services/mappers";
import type { Period } from "@/lib/types";
import { endPeriodSchema, MAX_PERIOD_DAYS, periodInputSchema, startPeriodSchema } from "@/lib/validation/period-schema";

/**
 * 經期紀錄。重疊／進行中規則先在交易內檢查並回清楚的訊息，
 * 同時發生的請求由資料庫的排除約束與部分唯一索引擋下，再轉成同樣的訊息。
 */

function conflict(message: string): AppError {
  return new AppError("period_conflict", message, 409);
}

function futureDate(field: "startDate" | "endDate"): AppError {
  return validationFailed([
    { field, message: field === "startDate" ? "開始日期不能晚於今天" : "結束日期不能晚於今天" },
  ]);
}

async function profilePeriods(tx: Tx, userId: string, profileId: string) {
  return tx
    .select()
    .from(periods)
    .where(and(eq(periods.userId, userId), eq(periods.profileId, profileId)))
    .orderBy(asc(periods.startDate));
}

/** 檢查新的日期範圍不和其他紀錄衝突 */
async function assertNoConflict(
  tx: Tx,
  userId: string,
  profileId: string,
  candidate: { startDate: string; endDate: string | null },
  excludeId?: string,
): Promise<void> {
  const existing = await profilePeriods(tx, userId, profileId);
  const hit = findPeriodConflict(existing, candidate, excludeId);
  if (hit) throw conflict(conflictMessage(hit));
}

/** 資料庫層的衝突（同時送出的請求）轉成使用者看得懂的訊息 */
async function translateDbConflict<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isExclusionViolation(error, "periods_no_overlap")) {
      throw conflict("經期日期與其他紀錄重疊，請重新整理後再試");
    }
    if (isUniqueViolation(error, "periods_one_open_uq")) {
      throw conflict("已有進行中的經期，請先結束或編輯那一筆");
    }
    throw error;
  }
}

export async function listPeriods(db: Db, userId: string, profileId: unknown): Promise<Period[]> {
  return withUser(db, userId, async (tx) => {
    const profile = await requireProfile(tx, userId, profileId);
    return (await profilePeriods(tx, userId, profile.id)).map(toPeriod);
  });
}

/** 開始經期（預設今天，可改成過去的日期；不能晚於今天） */
export async function startPeriod(
  db: Db,
  userId: string,
  profileId: unknown,
  input: unknown,
  today: unknown,
): Promise<Period> {
  const day = requireToday(today);
  const parsed = startPeriodSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const { startDate, notes } = parsed.data;
  if (startDate > day) throw futureDate("startDate");
  return translateDbConflict(() =>
    withUser(db, userId, async (tx) => {
      const profile = await requireProfile(tx, userId, profileId, { writable: true });
      await assertNoConflict(tx, userId, profile.id, { startDate, endDate: null });
      const [row] = await tx
        .insert(periods)
        .values({ userId, profileId: profile.id, startDate, endDate: null, notes })
        .returning();
      return toPeriod(row);
    }),
  );
}

/** 結束目前進行中的經期 */
export async function endPeriod(
  db: Db,
  userId: string,
  profileId: unknown,
  input: unknown,
  today: unknown,
): Promise<Period> {
  const day = requireToday(today);
  const parsed = endPeriodSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const { endDate } = parsed.data;
  if (endDate > day) throw futureDate("endDate");
  return withUser(db, userId, async (tx) => {
    const profile = await requireProfile(tx, userId, profileId, { writable: true });
    const [open] = await tx
      .select()
      .from(periods)
      .where(and(eq(periods.userId, userId), eq(periods.profileId, profile.id), isNull(periods.endDate)))
      .limit(1);
    if (!open) throw new AppError("no_active_period", "目前沒有進行中的經期。要補登過去的經期，可以從日曆新增", 409);
    if (endDate < open.startDate) {
      throw validationFailed([{ field: "endDate", message: "結束日期不能早於開始日期" }]);
    }
    if (diffDays(open.startDate, endDate) + 1 > MAX_PERIOD_DAYS) {
      throw validationFailed([{ field: "endDate", message: `單次經期最長 ${MAX_PERIOD_DAYS} 天，請檢查日期` }]);
    }
    const [row] = await tx
      .update(periods)
      .set({ endDate })
      .where(and(eq(periods.id, open.id), eq(periods.userId, userId)))
      .returning();
    return toPeriod(row);
  });
}

/** 補登一次經期（結束日可留空＝進行中，但必須是最新的一筆） */
export async function createPeriod(
  db: Db,
  userId: string,
  profileId: unknown,
  input: unknown,
  today: unknown,
): Promise<Period> {
  const day = requireToday(today);
  const parsed = periodInputSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const v = parsed.data;
  if (v.startDate > day) throw futureDate("startDate");
  if (v.endDate !== null && v.endDate > day) throw futureDate("endDate");
  return translateDbConflict(() =>
    withUser(db, userId, async (tx) => {
      const profile = await requireProfile(tx, userId, profileId, { writable: true });
      await assertNoConflict(tx, userId, profile.id, v);
      const [row] = await tx
        .insert(periods)
        .values({ userId, profileId: profile.id, startDate: v.startDate, endDate: v.endDate, notes: v.notes })
        .returning();
      return toPeriod(row);
    }),
  );
}

async function requirePeriod(tx: Tx, userId: string, periodId: unknown) {
  if (!isUuid(periodId)) throw notFound("這筆經期紀錄");
  const [row] = await tx
    .select()
    .from(periods)
    .where(and(eq(periods.id, periodId), eq(periods.userId, userId)))
    .limit(1);
  if (!row) throw notFound("這筆經期紀錄");
  return row;
}

/** 編輯一次經期的日期與備註 */
export async function updatePeriod(
  db: Db,
  userId: string,
  periodId: unknown,
  input: unknown,
  today: unknown,
): Promise<Period> {
  const day = requireToday(today);
  const parsed = periodInputSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const v = parsed.data;
  if (v.startDate > day) throw futureDate("startDate");
  if (v.endDate !== null && v.endDate > day) throw futureDate("endDate");
  return translateDbConflict(() =>
    withUser(db, userId, async (tx) => {
      const current = await requirePeriod(tx, userId, periodId);
      await requireProfile(tx, userId, current.profileId, { writable: true });
      await assertNoConflict(tx, userId, current.profileId, v, current.id);
      const [row] = await tx
        .update(periods)
        .set({ startDate: v.startDate, endDate: v.endDate, notes: v.notes })
        .where(and(eq(periods.id, current.id), eq(periods.userId, userId)))
        .returning();
      return toPeriod(row);
    }),
  );
}

export async function deletePeriod(db: Db, userId: string, periodId: unknown): Promise<void> {
  await withUser(db, userId, async (tx) => {
    const current = await requirePeriod(tx, userId, periodId);
    await requireProfile(tx, userId, current.profileId, { writable: true });
    await tx.delete(periods).where(and(eq(periods.id, current.id), eq(periods.userId, userId)));
  });
}
