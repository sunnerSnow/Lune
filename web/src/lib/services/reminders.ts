import { and, eq, inArray, sql } from "drizzle-orm";
import { DEFAULT_TIMEZONE, dateInTimezone } from "@/lib/date/date-utils";
import type { Db } from "@/lib/db/local";
import { rowsOf } from "@/lib/db/rows";
import { periods, pushSubscriptions, reminderSends } from "@/lib/db/schema";
import { withService } from "@/lib/db/with-user";
import type { PushResult, PushSender } from "@/lib/push";
import { type DueReminder, dueReminders, REMINDER_TEXT } from "@/lib/reminders/plan";

/** 送過的提醒紀錄保留多久（之後清掉）；比任何一則提醒的有效期間都長 */
const SENT_RETENTION_DAYS = 400;

export interface ReminderRunResult {
  today: string;
  /** 有開提醒、帳號也有訂閱裝置的 Profile 數 */
  profiles: number;
  /** 今天新送出的提醒（每則可能送到好幾台裝置） */
  reminders: number;
  sent: number;
  gone: number;
  failed: number;
}

interface CandidateRow {
  id: string;
  user_id: string;
  default_cycle_length: number | null;
  default_period_length: number | null;
  prediction_enabled: boolean;
  remind_before_days: number | null;
  remind_inactive: boolean;
  /** 最後一次記錄的時間（epoch 秒） */
  last_activity: number;
}

/** 點通知打開對應的 Profile（先切換再進首頁） */
export function reminderUrl(profileId: string): string {
  return `/api/reminders/open?profile=${encodeURIComponent(profileId)}`;
}

/**
 * 排程（每天台灣時間早上 9 點）：挑出今天該提醒的 Profile，送到這個帳號訂閱的每台裝置。
 * - 只看未封存、至少開了一種提醒、帳號有訂閱裝置的 Profile。
 * - 每則提醒先在 reminder_sends 佔位（主鍵擋重複），佔到了才送；同一天跑兩次也只送一次。
 *   一台裝置都沒送成功（推播服務暫時出錯）就把佔位退回，下次排程再試。
 * - 訂閱已失效（404／410）就刪掉。
 * 以伺服器身分執行：要跨帳號讀 Profile 與訂閱。送通知在交易外，不佔著資料庫連線等網路。
 */
export async function runReminders(db: Db, sender: PushSender, now: Date = new Date()): Promise<ReminderRunResult> {
  const today = dateInTimezone(now, DEFAULT_TIMEZONE);
  const result: ReminderRunResult = { today, profiles: 0, reminders: 0, sent: 0, gone: 0, failed: 0 };

  const { candidates, periodRows } = await withService(db, async (tx) => {
    // 最後一次記錄：經期與每日紀錄最後的新增／修改時間（updated_at 一定 ≥ created_at）；都沒有就用 Profile 建立時間
    const candidates = rowsOf<CandidateRow>(
      await tx.execute(sql`
        select p.id, p.user_id, p.default_cycle_length, p.default_period_length, p.prediction_enabled,
               p.remind_before_days, p.remind_inactive,
               extract(epoch from greatest(
                 p.created_at,
                 (select max(x.updated_at) from lune.periods x where x.profile_id = p.id),
                 (select max(x.updated_at) from lune.daily_logs x where x.profile_id = p.id)
               ))::float8 as last_activity
        from lune.profiles p
        where p.archived_at is null
          and (p.remind_before_days is not null or p.remind_inactive)
          and exists (select 1 from lune.push_subscriptions s where s.user_id = p.user_id)
      `),
    );
    const ids = candidates.map((c) => c.id);
    const periodRows = ids.length
      ? await tx
          .select({
            id: periods.id,
            profileId: periods.profileId,
            startDate: periods.startDate,
            endDate: periods.endDate,
          })
          .from(periods)
          .where(inArray(periods.profileId, ids))
      : [];
    await tx.execute(
      sql`delete from lune.reminder_sends where sent_at < now() - make_interval(days => ${SENT_RETENTION_DAYS})`,
    );
    return { candidates, periodRows };
  });
  result.profiles = candidates.length;

  for (const c of candidates) {
    const due = dueReminders(
      {
        defaultCycleLength: c.default_cycle_length,
        defaultPeriodLength: c.default_period_length,
        predictionEnabled: c.prediction_enabled,
        remindBeforeDays: c.remind_before_days,
        remindInactive: c.remind_inactive,
      },
      periodRows.filter((p) => p.profileId === c.id),
      dateInTimezone(new Date(Number(c.last_activity) * 1000), DEFAULT_TIMEZONE),
      today,
    );
    for (const reminder of due) {
      if (!(await claim(db, c.id, reminder))) continue;
      result.reminders += 1;
      const outcome = await deliver(db, sender, c.user_id, c.id, reminder);
      result.sent += outcome.sent;
      result.gone += outcome.gone;
      result.failed += outcome.failed;
      if (outcome.sent === 0) await release(db, c.id, reminder);
    }
  }
  return result;
}

async function claim(db: Db, profileId: string, r: DueReminder): Promise<boolean> {
  const rows = await withService(db, (tx) =>
    tx
      .insert(reminderSends)
      .values({ profileId, kind: r.kind, refDate: r.refDate })
      .onConflictDoNothing()
      .returning({ profileId: reminderSends.profileId }),
  );
  return rows.length > 0;
}

async function release(db: Db, profileId: string, r: DueReminder): Promise<void> {
  await withService(db, (tx) =>
    tx
      .delete(reminderSends)
      .where(
        and(
          eq(reminderSends.profileId, profileId),
          eq(reminderSends.kind, r.kind),
          eq(reminderSends.refDate, r.refDate),
        ),
      ),
  );
}

async function deliver(
  db: Db,
  sender: PushSender,
  userId: string,
  profileId: string,
  r: DueReminder,
): Promise<Record<PushResult, number>> {
  const targets = await withService(db, (tx) =>
    tx
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId)),
  );
  const outcome: Record<PushResult, number> = { sent: 0, gone: 0, failed: 0 };
  const sentIds: string[] = [];
  const goneIds: string[] = [];
  for (const t of targets) {
    const res = await sender.send(t, {
      body: REMINDER_TEXT[r.kind],
      url: reminderUrl(profileId),
      tag: `lune-${r.kind}-${profileId}`,
    });
    outcome[res] += 1;
    if (res === "sent") sentIds.push(t.id);
    if (res === "gone") goneIds.push(t.id);
  }
  if (sentIds.length || goneIds.length) {
    await withService(db, async (tx) => {
      if (sentIds.length) {
        await tx
          .update(pushSubscriptions)
          .set({ lastSentAt: sql`now()` })
          .where(inArray(pushSubscriptions.id, sentIds));
      }
      if (goneIds.length) await tx.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, goneIds));
    });
  }
  return outcome;
}
