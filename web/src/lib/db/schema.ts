import { boolean, date, integer, pgSchema, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authSchema } from "@/lib/db/auth-schema";
import { AVATAR_COLORS, FLOWS, MOODS, SYMPTOMS } from "@/lib/types";

/**
 * 與 db/migrations/*.sql 對應的 Drizzle schema（帳號表在 auth-schema.ts）。
 * 約束、RLS 與權限以 SQL migration 為準；這裡只描述欄位，讓查詢有型別。
 * 時間戳用 string（ISO）、日期用 string（YYYY-MM-DD），與領域型別一致。
 */
export const lune = pgSchema("lune");

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const profiles = lune.table("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  displayName: text("display_name").notNull(),
  avatarColor: text("avatar_color", { enum: AVATAR_COLORS }),
  defaultCycleLength: integer("default_cycle_length"),
  defaultPeriodLength: integer("default_period_length"),
  predictionEnabled: boolean("prediction_enabled").notNull().default(true),
  remindBeforeDays: smallint("remind_before_days").default(2),
  remindInactive: boolean("remind_inactive").notNull().default(true),
  archivedAt: ts("archived_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const periods = lune.table("periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  profileId: uuid("profile_id").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  notes: text("notes"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const dailyLogs = lune.table("daily_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  profileId: uuid("profile_id").notNull(),
  logDate: date("log_date", { mode: "string" }).notNull(),
  flow: text("flow", { enum: FLOWS }),
  symptoms: text("symptoms", { enum: SYMPTOMS }).array().notNull().default([]),
  mood: text("mood", { enum: MOODS }),
  notes: text("notes"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** 推播訂閱：一台裝置（瀏覽器）一筆，見 20261113000000_reminders.sql */
export const pushSubscriptions = lune.table("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastSentAt: ts("last_sent_at"),
});

/** 已送出的提醒（只有伺服器讀寫） */
export const reminderSends = lune.table(
  "reminder_sends",
  {
    profileId: uuid("profile_id").notNull(),
    kind: text("kind", { enum: ["upcoming", "inactive"] }).notNull(),
    refDate: date("ref_date", { mode: "string" }).notNull(),
    sentAt: ts("sent_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.kind, t.refDate] })],
);

export const schema = { ...authSchema, profiles, periods, dailyLogs, pushSubscriptions, reminderSends };
