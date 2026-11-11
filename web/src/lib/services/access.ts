import { and, eq } from "drizzle-orm";
import { isPlausibleToday } from "@/lib/date/date-utils";
import { profiles } from "@/lib/db/schema";
import { isUuid, type Tx } from "@/lib/db/with-user";
import { AppError, notFound } from "@/lib/errors";

/**
 * 交易內確認 Profile 屬於這個使用者。不存在與「不是你的」回同一個錯誤。
 * writable：要寫入紀錄時，封存中的 Profile 不能改。
 */
export async function requireProfile(
  tx: Tx,
  userId: string,
  profileId: unknown,
  { writable = false }: { writable?: boolean } = {},
): Promise<typeof profiles.$inferSelect> {
  if (!isUuid(profileId)) throw notFound("這個 Profile");
  const [row] = await tx
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
    .limit(1);
  if (!row) throw notFound("這個 Profile");
  if (writable && row.archivedAt !== null) {
    throw new AppError("profile_archived", "這個 Profile 已封存，請先取消封存再記錄", 409);
  }
  return row;
}

/**
 * 「今天」由前端依使用者時區決定後傳入；伺服器只確認它和 UTC 日期相差不超過一天
 * （伺服器在 UTC，不能自己判斷台灣使用者的今天）。
 */
export function requireToday(today: unknown): string {
  if (!isPlausibleToday(today)) {
    throw new AppError("invalid_today", "裝置日期與實際日期不符，請檢查手機或電腦的日期設定", 400);
  }
  return today;
}
