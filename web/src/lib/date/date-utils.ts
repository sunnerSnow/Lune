/**
 * 日期工具：全部以 YYYY-MM-DD 字串運算（內部只用 Date.UTC），不受執行環境時區影響。
 * 「今天」必須由使用者所在時區決定：瀏覽器用 localToday()，伺服器只做合理範圍檢查（isPlausibleToday）。
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"] as const;

export const DEFAULT_TIMEZONE = "Asia/Taipei";

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

function fromUtc(ms: number): string {
  const t = new Date(ms);
  const y = String(t.getUTCFullYear()).padStart(4, "0");
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toUtc(date: string): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d);
}

/** 是否為真實存在的日期（2026-02-29 不算） */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [y, m, d] = parts(value);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** b − a 的天數 */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** 含頭尾的天數（同一天＝1） */
export function inclusiveDays(start: string, end: string): number {
  return diffDays(start, end) + 1;
}

export function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

/** 0＝週日 … 6＝週六 */
export function weekday(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

/** 某個時刻在指定時區的日曆日期 */
export function dateInTimezone(instant: Date, timezone: string = DEFAULT_TIMEZONE): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const pick = (type: string) => p.find((x) => x.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** 瀏覽器端的「今天」（使用者裝置所在時區） */
export function localToday(now: Date = new Date()): string {
  const y = String(now.getFullYear()).padStart(4, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 伺服器驗證前端傳來的「今天」：世界各時區的日期與 UTC 日期最多差一天，
 * 超出這個範圍就是竄改或裝置時間錯誤。
 */
export function isPlausibleToday(value: unknown, now: Date = new Date()): value is string {
  if (!isIsoDate(value)) return false;
  const utcToday = fromUtc(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.abs(diffDays(utcToday, value)) <= 1;
}

// ---------------------------------------------------------------------------
// 月份
// ---------------------------------------------------------------------------

/** YYYY-MM */
export type YearMonth = string;

export function yearMonthOf(date: string): YearMonth {
  return date.slice(0, 7);
}

export function isYearMonth(value: unknown): value is YearMonth {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value) && isIsoDate(`${value}-01`);
}

export function addMonths(ym: YearMonth, months: number): YearMonth {
  const [y, m] = ym.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = index - ny * 12 + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}`;
}

export function daysInMonth(ym: YearMonth): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export interface CalendarCell {
  date: string;
  /** 是否屬於這個月（前後補的格子為 false） */
  inMonth: boolean;
}

/**
 * 月曆格：週日開頭，前後補上相鄰月份的日期，只補到整週為止（4–6 週）。
 */
export function monthGrid(ym: YearMonth): CalendarCell[][] {
  const first = `${ym}-01`;
  const last = `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`;
  const gridStart = addDays(first, -weekday(first));
  const gridEnd = addDays(last, 6 - weekday(last));
  const weeks: CalendarCell[][] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(d, i);
        return { date, inMonth: yearMonthOf(date) === ym };
      }),
    );
  }
  return weeks;
}

// ---------------------------------------------------------------------------
// 顯示
// ---------------------------------------------------------------------------

/** 11 月 6 日（週四） */
export function formatDate(date: string): string {
  const [, m, d] = parts(date);
  return `${m} 月 ${d} 日（週${WEEKDAYS[weekday(date)]}）`;
}

/** 11/6 */
export function formatShortDate(date: string): string {
  const [, m, d] = parts(date);
  return `${m}/${d}`;
}

/** 2026 年 11 月 */
export function formatYearMonth(ym: YearMonth): string {
  const [y, m] = ym.split("-").map(Number);
  return `${y} 年 ${m} 月`;
}

/** 11/6–11/10；同一天只顯示一次 */
export function formatDateRange(start: string, end: string): string {
  return start === end ? formatShortDate(start) : `${formatShortDate(start)}–${formatShortDate(end)}`;
}

export const WEEKDAY_LABELS = WEEKDAYS;
