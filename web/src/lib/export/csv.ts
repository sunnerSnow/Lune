import { inclusiveDays } from "@/lib/date/date-utils";
import { FLOW_LABELS, MOOD_LABELS, SYMPTOM_LABELS } from "@/lib/labels";
import type { DailyLog, Period, Profile } from "@/lib/types";

/**
 * CSV 匯出（純函式）。
 * - 開頭加 UTF-8 BOM：Excel 才會用 UTF-8 開，中文不會變亂碼。
 * - 換行用 CRLF（RFC 4180）。
 * - 防公式注入：使用者輸入的欄位（名稱、備註）若以 = + - @ 或 Tab、CR 開頭，前面加單引號，
 *   避免 Excel／試算表把它當公式執行。
 */
const BOM = "﻿";

export function csvCell(value: string | number | null | undefined, { userInput = false } = {}): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (userInput && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(header: string[], rows: string[][]): string {
  return BOM + [header.map((h) => csvCell(h)).join(","), ...rows.map((r) => r.join(","))].join("\r\n") + "\r\n";
}

type ProfileWithRecords = Profile & { periods: Period[]; dailyLogs: DailyLog[] };

export function periodsCsv(profiles: readonly ProfileWithRecords[]): string {
  const rows = profiles.flatMap((p) =>
    p.periods.map((x) => [
      csvCell(p.displayName, { userInput: true }),
      csvCell(x.startDate),
      csvCell(x.endDate),
      csvCell(x.endDate ? inclusiveDays(x.startDate, x.endDate) : "進行中"),
      csvCell(x.notes, { userInput: true }),
    ]),
  );
  return csv(["Profile", "開始日期", "結束日期", "天數", "備註"], rows);
}

export function dailyLogsCsv(profiles: readonly ProfileWithRecords[]): string {
  const rows = profiles.flatMap((p) =>
    p.dailyLogs.map((l) => [
      csvCell(p.displayName, { userInput: true }),
      csvCell(l.date),
      csvCell(l.flow ? FLOW_LABELS[l.flow] : ""),
      csvCell(l.symptoms.map((s) => SYMPTOM_LABELS[s]).join("、")),
      csvCell(l.mood ? MOOD_LABELS[l.mood] : ""),
      csvCell(l.notes, { userInput: true }),
    ]),
  );
  return csv(["Profile", "日期", "經血量", "症狀", "心情", "備註"], rows);
}
