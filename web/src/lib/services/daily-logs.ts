import { and, asc, eq, gte, lte } from "drizzle-orm";
import { diffDays, isIsoDate } from "@/lib/date/date-utils";
import type { Db } from "@/lib/db/local";
import { dailyLogs } from "@/lib/db/schema";
import { withUser } from "@/lib/db/with-user";
import { issuesFromZod, validationFailed } from "@/lib/errors";
import { requireProfile, requireToday } from "@/lib/services/access";
import { toDailyLog } from "@/lib/services/mappers";
import type { DailyLog } from "@/lib/types";
import { dailyLogSchema, isEmptyLog } from "@/lib/validation/daily-log-schema";

/**
 * 每日身體紀錄：同一個 Profile 同一天只有一筆，再次儲存是更新。
 * 記錄症狀不會讓那天變成經期（經期只看 periods）。
 */

/** 一次查詢最多幾天（月曆一頁約 42 天；分析頁可查一年多） */
export const MAX_LOG_RANGE_DAYS = 400;

/**
 * 儲存某一天的紀錄（新增或更新）。日期以外全部清空視為刪除，回傳 null。
 */
export async function saveDailyLog(
  db: Db,
  userId: string,
  profileId: unknown,
  input: unknown,
  today: unknown,
): Promise<DailyLog | null> {
  const day = requireToday(today);
  const parsed = dailyLogSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const v = parsed.data;
  if (v.date > day) throw validationFailed([{ field: "date", message: "不能記錄未來的日期" }]);
  return withUser(db, userId, async (tx) => {
    const profile = await requireProfile(tx, userId, profileId, { writable: true });
    if (isEmptyLog(v)) {
      await tx
        .delete(dailyLogs)
        .where(and(eq(dailyLogs.userId, userId), eq(dailyLogs.profileId, profile.id), eq(dailyLogs.logDate, v.date)));
      return null;
    }
    const values = { flow: v.flow, symptoms: v.symptoms, mood: v.mood, notes: v.notes };
    const [row] = await tx
      .insert(dailyLogs)
      .values({ userId, profileId: profile.id, logDate: v.date, ...values })
      .onConflictDoUpdate({ target: [dailyLogs.profileId, dailyLogs.logDate], set: values })
      .returning();
    return toDailyLog(row);
  });
}

export async function deleteDailyLog(db: Db, userId: string, profileId: unknown, date: unknown): Promise<void> {
  if (!isIsoDate(date)) throw validationFailed([{ field: "date", message: "日期格式不正確" }]);
  await withUser(db, userId, async (tx) => {
    const profile = await requireProfile(tx, userId, profileId, { writable: true });
    await tx
      .delete(dailyLogs)
      .where(and(eq(dailyLogs.userId, userId), eq(dailyLogs.profileId, profile.id), eq(dailyLogs.logDate, date)));
  });
}

export async function getDailyLog(db: Db, userId: string, profileId: unknown, date: unknown): Promise<DailyLog | null> {
  if (!isIsoDate(date)) throw validationFailed([{ field: "date", message: "日期格式不正確" }]);
  return withUser(db, userId, async (tx) => {
    const profile = await requireProfile(tx, userId, profileId);
    const [row] = await tx
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.userId, userId), eq(dailyLogs.profileId, profile.id), eq(dailyLogs.logDate, date)))
      .limit(1);
    return row ? toDailyLog(row) : null;
  });
}

/** from～to（含頭尾）的紀錄，依日期排序 */
export async function listDailyLogs(
  db: Db,
  userId: string,
  profileId: unknown,
  from: unknown,
  to: unknown,
): Promise<DailyLog[]> {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) {
    throw validationFailed([{ field: "range", message: "日期範圍不正確" }]);
  }
  if (diffDays(from, to) + 1 > MAX_LOG_RANGE_DAYS) {
    throw validationFailed([{ field: "range", message: `一次最多查詢 ${MAX_LOG_RANGE_DAYS} 天` }]);
  }
  return withUser(db, userId, async (tx) => {
    const profile = await requireProfile(tx, userId, profileId);
    const rows = await tx
      .select()
      .from(dailyLogs)
      .where(
        and(
          eq(dailyLogs.userId, userId),
          eq(dailyLogs.profileId, profile.id),
          gte(dailyLogs.logDate, from),
          lte(dailyLogs.logDate, to),
        ),
      )
      .orderBy(asc(dailyLogs.logDate));
    return rows.map(toDailyLog);
  });
}
