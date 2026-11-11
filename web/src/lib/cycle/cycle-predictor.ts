import { addDays, diffDays } from "@/lib/date/date-utils";
import {
  type CycleSettingsInput,
  type CycleStats,
  computeCycleStats,
  type LengthSource,
  type PeriodInput,
  sortPeriods,
} from "@/lib/cycle/cycle-calculator";

/**
 * 週期狀態與下次經期預測（純函式）。
 * 預測只是估算：一律給日期區間、標示信心，不作為避孕或醫療判斷依據。
 */

/** 進行中的經期超過這個天數，提示「是否忘了按結束」 */
export const OPEN_PERIOD_WARNING_DAYS = 10;
/** 距離最近一次開始日超過這個天數，週期第幾天不顯示、也不預測（資料可能漏記） */
export const MAX_CYCLE_DAY = 90;
/** 用 Profile 預設週期估算時的區間半寬 */
export const DEFAULT_SOURCE_HALF_WIDTH = 3;
/** 區間半寬上限 */
export const MAX_HALF_WIDTH = 7;

export type Confidence = "low" | "medium" | "high";

export interface Prediction {
  source: LengthSource;
  confidence: Confidence;
  cycleLength: number;
  /** 預測開始日前後的誤差天數 */
  halfWidth: number;
  /** 最可能的開始日：最近一次經期開始日＋週期長度 */
  startDate: string;
  /** 可能開始的區間（startDate ± halfWidth） */
  windowStart: string;
  windowEnd: string;
  /** 預估經期天數；未知為 null（月曆只標開始區間） */
  periodLength: number | null;
  /** 預估經期最後一天（startDate＋periodLength－1） */
  endDate: string | null;
  irregular: boolean;
}

export type CycleWarning =
  | { kind: "interval_too_short" | "interval_too_long"; startDate: string; nextStartDate: string; length: number }
  | { kind: "open_period_long"; startDate: string; days: number }
  | { kind: "irregular" };

/** 沒有預測的原因 */
export type PredictionUnavailable = "disabled" | "no_periods" | "insufficient_data" | "stale";

/**
 * - no_data：還沒有任何經期紀錄
 * - in_period：經期進行中
 * - waiting：兩次經期之間
 * - late：已超過預測區間，且沒有進行中的經期
 * - stale：距離最近一次開始日超過 90 天（可能漏記），不預測
 */
export type CycleStatus = "no_data" | "in_period" | "waiting" | "late" | "stale";

export interface CycleSummary {
  today: string;
  lastPeriodStart: string | null;
  activePeriod: { id: string; startDate: string; day: number } | null;
  /** 目前週期第幾天（開始日＝第 1 天）；超過 90 天或沒有紀錄為 null */
  cycleDay: number | null;
  status: CycleStatus;
  /** late 時：今天距離預測開始日幾天 */
  daysLate: number | null;
  prediction: Prediction | null;
  predictionUnavailable: PredictionUnavailable | null;
  stats: CycleStats;
  warnings: CycleWarning[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 區間半寬與信心：預設值固定 ±3；個人資料依標準差，2–3 個間隔至少 ±2 */
function predictionSpread(stats: CycleStats): { halfWidth: number; confidence: Confidence } {
  if (stats.cycleLengthSource === "default") return { halfWidth: DEFAULT_SOURCE_HALF_WIDTH, confidence: "low" };
  const n = stats.usedIntervals.length;
  const sdWidth = Math.ceil(stats.cycleStdDev);
  if (n >= 4) {
    return { halfWidth: clamp(sdWidth, 1, MAX_HALF_WIDTH), confidence: stats.irregular ? "medium" : "high" };
  }
  return { halfWidth: clamp(Math.max(2, sdWidth), 2, MAX_HALF_WIDTH), confidence: "medium" };
}

export function computeCycleSummary(
  periods: readonly PeriodInput[],
  settings: CycleSettingsInput,
  today: string,
): CycleSummary {
  const sorted = sortPeriods(periods);
  const stats = computeCycleStats(sorted, settings);
  const last = sorted.at(-1) ?? null;
  const open = sorted.findLast((p) => p.endDate === null) ?? null;

  const warnings: CycleWarning[] = [];
  for (const i of stats.intervals) {
    if (i.issue) {
      warnings.push({
        kind: i.issue === "too_short" ? "interval_too_short" : "interval_too_long",
        startDate: i.startDate,
        nextStartDate: i.nextStartDate,
        length: i.length,
      });
    }
  }
  if (stats.irregular) warnings.push({ kind: "irregular" });

  const activePeriod = open
    ? { id: open.id, startDate: open.startDate, day: diffDays(open.startDate, today) + 1 }
    : null;
  if (activePeriod && activePeriod.day > OPEN_PERIOD_WARNING_DAYS) {
    warnings.push({ kind: "open_period_long", startDate: activePeriod.startDate, days: activePeriod.day });
  }

  const sinceLastStart = last ? diffDays(last.startDate, today) + 1 : null;
  const cycleDay =
    sinceLastStart !== null && sinceLastStart >= 1 && sinceLastStart <= MAX_CYCLE_DAY ? sinceLastStart : null;

  const base = { today, lastPeriodStart: last?.startDate ?? null, activePeriod, cycleDay, stats, warnings };

  if (!last) {
    return {
      ...base,
      status: "no_data",
      daysLate: null,
      prediction: null,
      predictionUnavailable: settings.predictionEnabled ? "no_periods" : "disabled",
    };
  }

  const stale = !activePeriod && sinceLastStart !== null && sinceLastStart > MAX_CYCLE_DAY;
  let prediction: Prediction | null = null;
  let predictionUnavailable: PredictionUnavailable | null = null;
  if (!settings.predictionEnabled) predictionUnavailable = "disabled";
  else if (stats.cycleLength === null || stats.cycleLengthSource === null) predictionUnavailable = "insufficient_data";
  else if (stale) predictionUnavailable = "stale";
  else {
    const { halfWidth, confidence } = predictionSpread(stats);
    const startDate = addDays(last.startDate, stats.cycleLength);
    prediction = {
      source: stats.cycleLengthSource,
      confidence,
      cycleLength: stats.cycleLength,
      halfWidth,
      startDate,
      windowStart: addDays(startDate, -halfWidth),
      windowEnd: addDays(startDate, halfWidth),
      periodLength: stats.periodLength,
      endDate: stats.periodLength !== null ? addDays(startDate, stats.periodLength - 1) : null,
      irregular: stats.irregular,
    };
  }

  if (activePeriod) return { ...base, status: "in_period", daysLate: null, prediction, predictionUnavailable };
  if (stale) return { ...base, status: "stale", daysLate: null, prediction, predictionUnavailable };
  // 超過預測區間仍沒有新的經期：標示延遲，但不把預測往後推（等使用者記錄實際開始日）
  if (prediction && today > prediction.windowEnd) {
    return {
      ...base,
      status: "late",
      daysLate: diffDays(prediction.startDate, today),
      prediction,
      predictionUnavailable,
    };
  }
  return { ...base, status: "waiting", daysLate: null, prediction, predictionUnavailable };
}
