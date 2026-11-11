import { diffDays, inclusiveDays } from "@/lib/date/date-utils";

/**
 * 週期統計（純函式）。名詞：
 * - 經期（period）：一次出血，startDate～endDate（含頭尾）；endDate 為 null 表示進行中。
 * - 週期長度（cycle length）：本次經期開始日到下一次經期開始日的天數。
 * - 經期長度（period length）：開始日到結束日，含頭尾；只算已結束的經期。
 */

export interface PeriodInput {
  id: string;
  startDate: string;
  endDate: string | null;
}

export interface CycleSettingsInput {
  defaultCycleLength: number | null;
  defaultPeriodLength: number | null;
  predictionEnabled: boolean;
}

/** 有效週期長度範圍：超出就不列入平均，並提示使用者檢查（可能重複記錄或漏記） */
export const MIN_VALID_CYCLE = 15;
export const MAX_VALID_CYCLE = 90;
/** 平均只取最近幾筆 */
export const RECENT_WINDOW = 6;
/** 至少幾個有效間隔才用個人平均 */
export const MIN_PERSONAL_INTERVALS = 2;
/** 使用的間隔最長與最短差超過這個天數，視為週期不規則 */
export const IRREGULAR_SPREAD = 7;

export type IntervalIssue = "too_short" | "too_long";

export interface CycleInterval {
  fromPeriodId: string;
  toPeriodId: string;
  startDate: string;
  nextStartDate: string;
  length: number;
  issue: IntervalIssue | null;
}

/** 依開始日由舊到新排序（不改動輸入） */
export function sortPeriods<T extends PeriodInput>(periods: readonly T[]): T[] {
  return [...periods].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
}

/** 相鄰經期開始日的間隔（由舊到新） */
export function cycleIntervals(periods: readonly PeriodInput[]): CycleInterval[] {
  const sorted = sortPeriods(periods);
  const result: CycleInterval[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const length = diffDays(a.startDate, b.startDate);
    const issue: IntervalIssue | null =
      length < MIN_VALID_CYCLE ? "too_short" : length > MAX_VALID_CYCLE ? "too_long" : null;
    result.push({
      fromPeriodId: a.id,
      toPeriodId: b.id,
      startDate: a.startDate,
      nextStartDate: b.startDate,
      length,
      issue,
    });
  }
  return result;
}

/** 經期長度（含頭尾）；進行中回 null */
export function periodLength(period: PeriodInput): number | null {
  return period.endDate ? inclusiveDays(period.startDate, period.endDate) : null;
}

export function mean(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** 樣本標準差（n − 1）；少於 2 筆回 0 */
export function sampleStdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

export type LengthSource = "personal" | "default";

export interface CycleStats {
  /** 所有相鄰間隔（含異常） */
  intervals: CycleInterval[];
  /** 15–90 天的間隔 */
  validIntervals: CycleInterval[];
  /** 實際用來平均的間隔（最近 6 個有效間隔） */
  usedIntervals: CycleInterval[];
  /** 個人平均週期（至少 2 個有效間隔才有；四捨五入） */
  personalCycleLength: number | null;
  /** 預測用的週期長度：個人平均 → Profile 預設 → null */
  cycleLength: number | null;
  cycleLengthSource: LengthSource | null;
  /** 使用間隔的樣本標準差（天） */
  cycleStdDev: number;
  /** 使用間隔的最長－最短 > 7 天 */
  irregular: boolean;
  /** 已結束的經期數 */
  completedPeriodCount: number;
  /** 個人平均經期長度（最近 6 筆已結束的；四捨五入） */
  personalPeriodLength: number | null;
  /** 預測用的經期長度：個人平均 → Profile 預設 → null */
  periodLength: number | null;
  periodLengthSource: LengthSource | null;
}

export function computeCycleStats(periods: readonly PeriodInput[], settings: CycleSettingsInput): CycleStats {
  const sorted = sortPeriods(periods);
  const intervals = cycleIntervals(sorted);
  const validIntervals = intervals.filter((i) => i.issue === null);
  const usedIntervals = validIntervals.slice(-RECENT_WINDOW);
  const usedLengths = usedIntervals.map((i) => i.length);

  const personalCycleLength = usedIntervals.length >= MIN_PERSONAL_INTERVALS ? Math.round(mean(usedLengths)) : null;
  const cycleLength = personalCycleLength ?? settings.defaultCycleLength ?? null;
  const cycleLengthSource: LengthSource | null =
    personalCycleLength !== null ? "personal" : settings.defaultCycleLength != null ? "default" : null;

  const completed = sorted.filter((p) => p.endDate !== null);
  const recentLengths = completed.slice(-RECENT_WINDOW).map((p) => periodLength(p) as number);
  const personalPeriodLength = recentLengths.length > 0 ? Math.round(mean(recentLengths)) : null;
  const periodLen = personalPeriodLength ?? settings.defaultPeriodLength ?? null;
  const periodLengthSource: LengthSource | null =
    personalPeriodLength !== null ? "personal" : settings.defaultPeriodLength != null ? "default" : null;

  const irregular =
    personalCycleLength !== null && Math.max(...usedLengths) - Math.min(...usedLengths) > IRREGULAR_SPREAD;

  return {
    intervals,
    validIntervals,
    usedIntervals,
    personalCycleLength,
    cycleLength,
    cycleLengthSource,
    cycleStdDev: personalCycleLength !== null ? sampleStdDev(usedLengths) : 0,
    irregular,
    completedPeriodCount: completed.length,
    personalPeriodLength,
    periodLength: periodLen,
    periodLengthSource,
  };
}

export interface CycleAnalytics {
  /** 已記錄的經期數 */
  periodCount: number;
  /** 已完成的有效週期數（15–90 天的間隔） */
  cycleCount: number;
  /** 個人平均週期（資料不足為 null，不用預設值充數） */
  averageCycleLength: number | null;
  /** 個人平均經期（沒有已結束的經期為 null） */
  averagePeriodLength: number | null;
  /** 最近 6 次週期（由舊到新，含被排除的異常間隔，讓使用者看得到） */
  recentCycles: { startDate: string; length: number; issue: IntervalIssue | null }[];
  irregular: boolean;
}

/** 分析頁的統計卡片：只用個人資料，資料不足就回 null，由介面顯示「累積更多紀錄後即可查看」 */
export function computeAnalytics(periods: readonly PeriodInput[]): CycleAnalytics {
  const stats = computeCycleStats(periods, {
    defaultCycleLength: null,
    defaultPeriodLength: null,
    predictionEnabled: true,
  });
  return {
    periodCount: periods.length,
    cycleCount: stats.validIntervals.length,
    averageCycleLength: stats.personalCycleLength,
    averagePeriodLength: stats.personalPeriodLength,
    recentCycles: stats.intervals
      .slice(-RECENT_WINDOW)
      .map((i) => ({ startDate: i.startDate, length: i.length, issue: i.issue })),
    irregular: stats.irregular,
  };
}
