import { addDays } from "@/lib/date/date-utils";
import { cycleIntervals, type IntervalIssue, type PeriodInput } from "@/lib/cycle/cycle-calculator";
import { type Mood, MOODS, type Symptom, SYMPTOMS } from "@/lib/types";

/**
 * 分析頁圖表的資料（純函式）。
 * 時間範圍只影響趨勢圖與頻率圖；統計卡片與星座圖仍用全部紀錄。
 */

export const RANGES = { "3m": 90, "6m": 182, "12m": 365 } as const;
export type RangeKey = keyof typeof RANGES;
export const DEFAULT_RANGE: RangeKey = "6m";

export function isRangeKey(value: unknown): value is RangeKey {
  return typeof value === "string" && Object.hasOwn(RANGES, value);
}

/** 範圍的第一天（含今天往回推 N 天） */
export function rangeStart(range: RangeKey, today: string): string {
  return addDays(today, -(RANGES[range] - 1));
}

export interface TrendPoint {
  /** 這個週期的開始日（經期開始日） */
  startDate: string;
  /** 下一次經期開始日 */
  nextStartDate: string;
  length: number;
  /** 不列入平均的異常間隔 */
  issue: IntervalIssue | null;
}

/** 週期長度趨勢：開始日在範圍內的完整週期（由舊到新） */
export function cycleTrend(periods: readonly PeriodInput[], from: string): TrendPoint[] {
  return cycleIntervals(periods)
    .filter((i) => i.startDate >= from)
    .map((i) => ({ startDate: i.startDate, nextStartDate: i.nextStartDate, length: i.length, issue: i.issue }));
}

export interface CountRow<K extends string> {
  key: K;
  /** 出現的天數 */
  days: number;
}

interface LogLike {
  symptoms: readonly Symptom[];
  mood: Mood | null;
}

/** 依天數由多到少；同數時照選項原本的順序。沒出現過的不列 */
function ranked<K extends string>(order: readonly K[], counts: Map<K, number>): CountRow<K>[] {
  return order
    .map((key) => ({ key, days: counts.get(key) ?? 0 }))
    .filter((r) => r.days > 0)
    .sort((a, b) => b.days - a.days || order.indexOf(a.key) - order.indexOf(b.key));
}

/** 每個症狀出現在幾天的紀錄裡（「無症狀」也算一列，代表那天明確記了沒有不舒服） */
export function symptomCounts(logs: readonly LogLike[]): CountRow<Symptom>[] {
  const counts = new Map<Symptom, number>();
  for (const log of logs) for (const s of new Set(log.symptoms)) counts.set(s, (counts.get(s) ?? 0) + 1);
  return ranked(SYMPTOMS, counts);
}

/** 每種心情出現幾天 */
export function moodCounts(logs: readonly LogLike[]): CountRow<Mood>[] {
  const counts = new Map<Mood, number>();
  for (const log of logs) if (log.mood) counts.set(log.mood, (counts.get(log.mood) ?? 0) + 1);
  return ranked(MOODS, counts);
}

/** 趨勢圖的 y 軸：上下各留一點空間，刻度取 5 的倍數 */
export function trendDomain(lengths: readonly number[]): { min: number; max: number; ticks: number[] } {
  const lo = Math.min(...lengths);
  const hi = Math.max(...lengths);
  const min = Math.floor((lo - 2) / 5) * 5;
  const max = Math.ceil((hi + 2) / 5) * 5;
  const ticks: number[] = [];
  for (let t = min; t <= max; t += 5) ticks.push(t);
  return { min, max, ticks };
}
