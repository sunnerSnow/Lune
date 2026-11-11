import { type CalendarCell, monthGrid, type YearMonth } from "@/lib/date/date-utils";
import type { PeriodInput } from "@/lib/cycle/cycle-calculator";
import type { Prediction } from "@/lib/cycle/cycle-predictor";

/**
 * 月曆每一格的標示（純函式）。實際與預測分開標，介面要搭配圖示／圖例，不能只靠顏色區分。
 * 補登某天的症狀不會讓那天變成經期：經期只看 periods。
 */

export type PeriodPosition = "start" | "middle" | "end" | "single";

export interface DayMarks {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  /** 實際經期（已記錄）；進行中的經期只標到今天 */
  period: { periodId: string; position: PeriodPosition; ongoing: boolean } | null;
  /** 預估經期日：預測開始日起算預估經期天數（經期天數未知時不標） */
  predictedPeriod: boolean;
  /** 預測可能開始的區間 */
  predictedWindow: boolean;
  /** 當天有每日紀錄 */
  hasLog: boolean;
}

export interface MarkInput {
  periods: readonly PeriodInput[];
  logDates: Iterable<string>;
  prediction: Prediction | null;
  today: string;
}

export function markDays(cells: readonly CalendarCell[], input: MarkInput): DayMarks[] {
  const logs = new Set(input.logDates);
  const { prediction, today } = input;
  return cells.map(({ date, inMonth }) => {
    let period: DayMarks["period"] = null;
    for (const p of input.periods) {
      const ongoing = p.endDate === null;
      const last = p.endDate ?? today;
      if (date < p.startDate || date > last) continue;
      const position: PeriodPosition =
        date === p.startDate && date === p.endDate
          ? "single"
          : date === p.startDate
            ? "start"
            : date === p.endDate
              ? "end"
              : "middle";
      period = { periodId: p.id, position, ongoing };
      break;
    }
    const predictedPeriod =
      !period &&
      prediction !== null &&
      prediction.endDate !== null &&
      date >= prediction.startDate &&
      date <= prediction.endDate;
    const predictedWindow =
      !period && prediction !== null && date >= prediction.windowStart && date <= prediction.windowEnd;
    return {
      date,
      inMonth,
      isToday: date === today,
      isFuture: date > today,
      period,
      predictedPeriod,
      predictedWindow,
      hasLog: logs.has(date),
    };
  });
}

/** 某個月的月曆（週日開頭）＋每格標示 */
export function monthMarks(ym: YearMonth, input: MarkInput): DayMarks[][] {
  return monthGrid(ym).map((week) => markDays(week, input));
}
