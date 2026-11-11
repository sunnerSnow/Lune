import { asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/local";
import { users } from "@/lib/db/auth-schema";
import { dailyLogs, periods, profiles } from "@/lib/db/schema";
import { withService, withUser } from "@/lib/db/with-user";
import { toDailyLog, toPeriod, toProfile } from "@/lib/services/mappers";
import type { DailyLog, Period, Profile } from "@/lib/types";

/** 匯出格式版本：欄位有破壞性變更時才加一 */
export const EXPORT_FORMAT = "lune-export@1";

export interface UserExport {
  format: typeof EXPORT_FORMAT;
  exportedAt: string;
  account: { email: string; name: string; createdAt: string };
  /** 含已封存的 Profile；每個 Profile 底下是它的經期與每日紀錄 */
  profiles: (Profile & { periods: Period[]; dailyLogs: DailyLog[] })[];
}

/**
 * 匯出這個帳號的所有資料（JSON）。紀錄部分走 withUser（RLS），
 * 帳號基本資料（auth schema，authenticated 角色讀不到）以伺服器身分只讀 email／名稱／建立時間。
 */
export async function exportUserData(db: Db, userId: string, now: Date = new Date()): Promise<UserExport> {
  const [account] = await withService(db, (tx) =>
    tx
      .select({ email: users.email, name: users.name, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  );
  if (!account) throw new Error("找不到帳號");

  const data = await withUser(db, userId, async (tx) => {
    const profileRows = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .orderBy(asc(profiles.createdAt));
    const periodRows = await tx
      .select()
      .from(periods)
      .where(eq(periods.userId, userId))
      .orderBy(asc(periods.startDate));
    const logRows = await tx
      .select()
      .from(dailyLogs)
      .where(eq(dailyLogs.userId, userId))
      .orderBy(asc(dailyLogs.logDate));
    return { profileRows, periodRows, logRows };
  });

  const allPeriods = data.periodRows.map(toPeriod);
  const allLogs = data.logRows.map(toDailyLog);
  return {
    format: EXPORT_FORMAT,
    exportedAt: now.toISOString(),
    account: { email: account.email, name: account.name, createdAt: account.createdAt.toISOString() },
    profiles: data.profileRows.map((row) => {
      const p = toProfile(row);
      return {
        ...p,
        periods: allPeriods.filter((x) => x.profileId === p.id),
        dailyLogs: allLogs.filter((x) => x.profileId === p.id),
      };
    }),
  };
}
