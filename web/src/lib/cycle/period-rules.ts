import { formatDateRange, formatShortDate } from "@/lib/date/date-utils";
import type { PeriodInput } from "@/lib/cycle/cycle-calculator";

/**
 * 經期重疊規則（純函式；資料庫另有排除約束當最後一道防線）。
 * 進行中的經期（endDate null）視為延伸到無限遠，所以：
 * - 同一個 Profile 最多一筆進行中
 * - 進行中的經期必須是最新的一筆（之後不能再有紀錄）
 */

export type PeriodConflict =
  | { kind: "open_exists"; period: PeriodInput }
  | { kind: "open_not_latest"; period: PeriodInput }
  | { kind: "overlap"; period: PeriodInput };

interface Candidate {
  startDate: string;
  endDate: string | null;
}

function overlaps(a: Candidate, b: Candidate): boolean {
  const aEnd = a.endDate ?? "9999-12-31";
  const bEnd = b.endDate ?? "9999-12-31";
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

/** 找出候選經期與既有紀錄的第一個衝突；excludeId 是編輯中的那一筆 */
export function findPeriodConflict(
  existing: readonly PeriodInput[],
  candidate: Candidate,
  excludeId?: string,
): PeriodConflict | null {
  const others = existing
    .filter((p) => p.id !== excludeId)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
  if (candidate.endDate === null) {
    const open = others.find((p) => p.endDate === null);
    if (open) return { kind: "open_exists", period: open };
    const later = others.find((p) => p.startDate >= candidate.startDate);
    if (later) return { kind: "open_not_latest", period: later };
  }
  const hit = others.find((p) => overlaps(p, candidate));
  return hit ? { kind: "overlap", period: hit } : null;
}

export function conflictMessage(conflict: PeriodConflict): string {
  const p = conflict.period;
  switch (conflict.kind) {
    case "open_exists":
      return `已有進行中的經期（${formatShortDate(p.startDate)} 開始），請先結束或編輯那一筆`;
    case "open_not_latest":
      return `${formatShortDate(p.startDate)} 已有經期紀錄；補登過去的經期請一併填寫結束日期`;
    case "overlap":
      return p.endDate === null
        ? `與進行中的經期（${formatShortDate(p.startDate)} 開始）重疊，請先結束或編輯那一筆`
        : `與 ${formatDateRange(p.startDate, p.endDate)} 的經期重疊，請調整日期或編輯那一筆`;
  }
}
