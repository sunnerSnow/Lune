import type { dailyLogs, periods, profiles } from "@/lib/db/schema";
import type { DailyLog, Period, Profile } from "@/lib/types";

/** Postgres 回傳的 timestamptz 字串（例如 2026-11-11 10:00:00+00）統一成 ISO */
export function iso(value: string): string {
  return new Date(value).toISOString();
}

/** 資料庫列 → 領域型別（不帶 user_id） */
export function toProfile(row: typeof profiles.$inferSelect): Profile {
  return {
    id: row.id,
    displayName: row.displayName,
    avatarColor: row.avatarColor ?? null,
    defaultCycleLength: row.defaultCycleLength ?? null,
    defaultPeriodLength: row.defaultPeriodLength ?? null,
    predictionEnabled: row.predictionEnabled,
    remindBeforeDays: row.remindBeforeDays ?? null,
    remindInactive: row.remindInactive,
    archived: row.archivedAt !== null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toPeriod(row: typeof periods.$inferSelect): Period {
  return {
    id: row.id,
    profileId: row.profileId,
    startDate: row.startDate,
    endDate: row.endDate ?? null,
    notes: row.notes ?? null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toDailyLog(row: typeof dailyLogs.$inferSelect): DailyLog {
  return {
    id: row.id,
    profileId: row.profileId,
    date: row.logDate,
    flow: row.flow ?? null,
    symptoms: row.symptoms,
    mood: row.mood ?? null,
    notes: row.notes ?? null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
