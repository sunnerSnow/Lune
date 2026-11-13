import type { CycleSettingsInput, PeriodInput } from "@/lib/cycle/cycle-calculator";
import { computeCycleSummary } from "@/lib/cycle/cycle-predictor";
import { addDays, diffDays } from "@/lib/date/date-utils";

/**
 * 提醒規則（純函式）：每天早上排程跑一次，決定每個 Profile 今天要送哪些提醒。
 * 同一則提醒用 (kind, refDate) 判斷是否送過（資料庫 reminder_sends），所以這裡只回「今天符合條件的」，
 * 排程漏跑一天、隔天補跑也還會送；送過的不會再送。
 */

/** 超過這麼多天沒有新增或修改任何紀錄，就提醒一次 */
export const INACTIVE_DAYS = 35;

export type ReminderKind = "upcoming" | "inactive";

export interface DueReminder {
  kind: ReminderKind;
  /** upcoming：這次週期的開始日（一個週期只提醒一次）；inactive：最後一次記錄的日期（每段空窗只提醒一次） */
  refDate: string;
}

export interface ReminderSettings extends CycleSettingsInput {
  remindBeforeDays: number | null;
  remindInactive: boolean;
}

/**
 * - upcoming（預測快到了）：兩次經期之間（不是經期中、沒有超過預測區間、資料沒有過舊），
 *   今天落在「預測區間開始前 N 天」到「預測區間結束」之間。沒有預測（關閉、資料不足）就不提醒。
 * - inactive（很久沒記錄）：最後一次新增或修改經期／每日紀錄的日期（沒有任何紀錄就用 Profile 建立日）距今 ≥ 35 天。
 * @param lastActivity 最後一次記錄的日期（YYYY-MM-DD，台灣時間）
 * @param today 今天（YYYY-MM-DD，台灣時間）
 */
export function dueReminders(
  settings: ReminderSettings,
  periods: readonly PeriodInput[],
  lastActivity: string,
  today: string,
): DueReminder[] {
  const due: DueReminder[] = [];
  if (settings.remindBeforeDays !== null) {
    const summary = computeCycleSummary(periods, settings, today);
    const p = summary.prediction;
    if (p && summary.status === "waiting" && summary.lastPeriodStart) {
      const from = addDays(p.windowStart, -settings.remindBeforeDays);
      if (today >= from && today <= p.windowEnd) due.push({ kind: "upcoming", refDate: summary.lastPeriodStart });
    }
  }
  if (settings.remindInactive && diffDays(lastActivity, today) >= INACTIVE_DAYS) {
    due.push({ kind: "inactive", refDate: lastActivity });
  }
  return due;
}

/**
 * 通知內容：會出現在鎖定畫面，所以標題固定「Luné」，內文不提經期、症狀、Profile 名稱。
 * 點通知打開對應的 Profile（見 /api/reminders/open）。
 */
export const REMINDER_TEXT: Record<ReminderKind | "test", string> = {
  upcoming: "預估的日子快到了，點開看看。",
  inactive: "好一陣子沒有記錄了，有空打開 Luné 更新一下。",
  test: "通知設定完成，之後的提醒會像這樣出現。",
};
