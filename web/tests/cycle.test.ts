import { describe, expect, it } from "vitest";
import { markDays, monthMarks } from "@/lib/cycle/calendar-marks";
import {
  computeAnalytics,
  computeCycleStats,
  cycleIntervals,
  type CycleSettingsInput,
  type PeriodInput,
  periodLength,
} from "@/lib/cycle/cycle-calculator";
import { computeCycleSummary } from "@/lib/cycle/cycle-predictor";
import { conflictMessage, findPeriodConflict } from "@/lib/cycle/period-rules";
import { addDays } from "@/lib/date/date-utils";

const NO_DEFAULTS: CycleSettingsInput = {
  defaultCycleLength: null,
  defaultPeriodLength: null,
  predictionEnabled: true,
};

let seq = 0;
function period(startDate: string, endDate: string | null = addDays(startDate, 4)): PeriodInput {
  seq += 1;
  return { id: `p${seq}`, startDate, endDate };
}

/** 從 first 開始，依序以 gaps 為間隔建立經期（每次 5 天，最後一筆可指定為進行中） */
function history(first: string, gaps: number[], { lastOpen = false } = {}): PeriodInput[] {
  const list = [period(first)];
  let start = first;
  for (const g of gaps) {
    start = addDays(start, g);
    list.push(period(start));
  }
  if (lastOpen) list[list.length - 1] = { ...list[list.length - 1], endDate: null };
  return list;
}

describe("週期間隔與經期長度", () => {
  it("依開始日排序後計算間隔（輸入順序不影響）", () => {
    const list = history("2026-01-05", [28, 31]);
    const intervals = cycleIntervals([list[2], list[0], list[1]]);
    expect(intervals.map((i) => i.length)).toEqual([28, 31]);
    expect(intervals[0]).toMatchObject({ startDate: "2026-01-05", nextStartDate: "2026-02-02", issue: null });
  });

  it("跨年與閏年的間隔", () => {
    expect(cycleIntervals([period("2026-12-20"), period("2027-01-17")])[0].length).toBe(28);
    expect(cycleIntervals([period("2024-02-10"), period("2024-03-09")])[0].length).toBe(28);
  });

  it("15 天以下或 90 天以上標記為異常", () => {
    const intervals = cycleIntervals(history("2026-01-01", [14, 15, 90, 91]));
    expect(intervals.map((i) => i.issue)).toEqual(["too_short", null, null, "too_long"]);
  });

  it("經期長度含頭尾；進行中為 null", () => {
    expect(periodLength(period("2026-11-01", "2026-11-05"))).toBe(5);
    expect(periodLength(period("2026-11-01", "2026-11-01"))).toBe(1);
    expect(periodLength(period("2026-11-01", null))).toBeNull();
  });
});

describe("週期統計", () => {
  it("只有 1 個間隔：不算個人平均，沒有預設值就不預測", () => {
    const stats = computeCycleStats(history("2026-09-01", [30]), NO_DEFAULTS);
    expect(stats.personalCycleLength).toBeNull();
    expect(stats.cycleLength).toBeNull();
    expect(stats.cycleLengthSource).toBeNull();
  });

  it("資料不足時改用 Profile 預設週期", () => {
    const stats = computeCycleStats(history("2026-09-01", [30]), { ...NO_DEFAULTS, defaultCycleLength: 32 });
    expect(stats).toMatchObject({ cycleLength: 32, cycleLengthSource: "default", personalCycleLength: null });
  });

  it("至少 2 個有效間隔就用個人平均（四捨五入），而且只取最近 6 個", () => {
    const two = computeCycleStats(history("2026-01-01", [28, 31]), { ...NO_DEFAULTS, defaultCycleLength: 40 });
    expect(two).toMatchObject({ personalCycleLength: 30, cycleLength: 30, cycleLengthSource: "personal" });

    // 最早的 40 天不在最近 6 個裡
    const many = computeCycleStats(history("2025-01-01", [40, 28, 29, 30, 28, 29, 30]), NO_DEFAULTS);
    expect(many.usedIntervals.map((i) => i.length)).toEqual([28, 29, 30, 28, 29, 30]);
    expect(many.personalCycleLength).toBe(29);
  });

  it("異常間隔不列入平均", () => {
    const stats = computeCycleStats(history("2025-06-01", [28, 10, 120, 30, 29]), NO_DEFAULTS);
    expect(stats.validIntervals.map((i) => i.length)).toEqual([28, 30, 29]);
    expect(stats.personalCycleLength).toBe(29);
  });

  it("經期長度：最近 6 筆已結束的平均；沒有就用預設，再沒有就是 null", () => {
    const list = [
      period("2026-08-01", "2026-08-05"),
      period("2026-08-29", "2026-09-03"),
      period("2026-09-27", "2026-09-30"),
    ];
    expect(computeCycleStats(list, NO_DEFAULTS)).toMatchObject({
      personalPeriodLength: 5,
      periodLength: 5,
      periodLengthSource: "personal",
    });

    const onlyOpen = [period("2026-11-01", null)];
    expect(computeCycleStats(onlyOpen, { ...NO_DEFAULTS, defaultPeriodLength: 6 })).toMatchObject({
      personalPeriodLength: null,
      periodLength: 6,
      periodLengthSource: "default",
      completedPeriodCount: 0,
    });
    expect(computeCycleStats(onlyOpen, NO_DEFAULTS).periodLength).toBeNull();
  });

  it("最長與最短差超過 7 天視為不規則", () => {
    expect(computeCycleStats(history("2026-01-01", [22, 35, 28, 30]), NO_DEFAULTS).irregular).toBe(true);
    expect(computeCycleStats(history("2026-01-01", [26, 33, 28, 30]), NO_DEFAULTS).irregular).toBe(false);
  });
});

describe("週期摘要與預測", () => {
  it("沒有紀錄：no_data；關閉預測時原因是 disabled", () => {
    expect(computeCycleSummary([], NO_DEFAULTS, "2026-11-11")).toMatchObject({
      status: "no_data",
      prediction: null,
      predictionUnavailable: "no_periods",
      cycleDay: null,
      lastPeriodStart: null,
    });
    expect(
      computeCycleSummary([], { ...NO_DEFAULTS, predictionEnabled: false }, "2026-11-11").predictionUnavailable,
    ).toBe("disabled");
  });

  it("只有一次經期且沒有預設值：資料不足，不顯示預測", () => {
    const s = computeCycleSummary([period("2026-11-01")], NO_DEFAULTS, "2026-11-11");
    expect(s).toMatchObject({
      status: "waiting",
      prediction: null,
      predictionUnavailable: "insufficient_data",
      cycleDay: 11,
    });
  });

  it("用預設週期估算：信心 low、區間固定 ±3", () => {
    const s = computeCycleSummary([period("2026-11-01")], { ...NO_DEFAULTS, defaultCycleLength: 30 }, "2026-11-11");
    expect(s.prediction).toMatchObject({
      source: "default",
      confidence: "low",
      cycleLength: 30,
      halfWidth: 3,
      startDate: "2026-12-01",
      windowStart: "2026-11-28",
      windowEnd: "2026-12-04",
      periodLength: 5,
      endDate: "2026-12-05",
    });
  });

  it("2–3 個間隔：信心 medium，區間至少 ±2", () => {
    const list = history("2026-08-15", [28, 30]);
    const s = computeCycleSummary(list, NO_DEFAULTS, addDays(list[2].startDate, 5));
    expect(s.prediction).toMatchObject({ source: "personal", confidence: "medium", cycleLength: 29, halfWidth: 2 });
    expect(s.prediction?.startDate).toBe(addDays(list[2].startDate, 29));
  });

  it("4 個以上且穩定：信心 high，區間依標準差（至少 ±1）", () => {
    const list = history("2025-01-01", [40, 28, 29, 30, 28, 29, 30]);
    const today = addDays(list.at(-1)!.startDate, 10);
    const s = computeCycleSummary(list, NO_DEFAULTS, today);
    expect(s.prediction).toMatchObject({ confidence: "high", halfWidth: 1, cycleLength: 29, irregular: false });
  });

  it("不規則：信心降為 medium、區間加寬，並提醒僅供參考", () => {
    const list = history("2026-01-01", [22, 35, 28, 30]);
    const s = computeCycleSummary(list, NO_DEFAULTS, addDays(list.at(-1)!.startDate, 5));
    expect(s.prediction).toMatchObject({ confidence: "medium", halfWidth: 6, irregular: true });
    expect(s.warnings).toContainEqual({ kind: "irregular" });
  });

  it("異常間隔會列入提醒", () => {
    const list = history("2025-06-01", [28, 10, 120, 30, 29]);
    const s = computeCycleSummary(list, NO_DEFAULTS, addDays(list.at(-1)!.startDate, 3));
    expect(s.warnings.filter((w) => w.kind === "interval_too_short")).toHaveLength(1);
    expect(s.warnings.filter((w) => w.kind === "interval_too_long")).toHaveLength(1);
  });

  it("經期進行中：in_period、經期第幾天；超過 10 天提醒是否忘了結束", () => {
    const list = history("2026-08-01", [28, 30], { lastOpen: true });
    const start = list.at(-1)!.startDate;
    const s = computeCycleSummary(list, NO_DEFAULTS, addDays(start, 2));
    expect(s.status).toBe("in_period");
    expect(s.activePeriod).toEqual({ id: list.at(-1)!.id, startDate: start, day: 3 });
    expect(s.cycleDay).toBe(3);
    expect(s.prediction?.startDate).toBe(addDays(start, 29));
    expect(s.warnings.some((w) => w.kind === "open_period_long")).toBe(false);

    const long = computeCycleSummary(list, NO_DEFAULTS, addDays(start, 11));
    expect(long.warnings).toContainEqual({ kind: "open_period_long", startDate: start, days: 12 });
  });

  it("超過預測區間仍沒開始：late，不把預測往後推", () => {
    const list = history("2026-07-01", [28, 28, 28]);
    const last = list.at(-1)!.startDate;
    // 區間 ±2：last+26～last+30
    expect(computeCycleSummary(list, NO_DEFAULTS, addDays(last, 30)).status).toBe("waiting");
    const late = computeCycleSummary(list, NO_DEFAULTS, addDays(last, 31));
    expect(late).toMatchObject({ status: "late", daysLate: 3 });
    expect(late.prediction?.startDate).toBe(addDays(last, 28));
  });

  it("距離上次開始超過 90 天：stale，不預測、週期天數為 null", () => {
    const list = history("2026-01-01", [28, 28, 28]);
    const s = computeCycleSummary(list, NO_DEFAULTS, addDays(list.at(-1)!.startDate, 90));
    expect(s).toMatchObject({ status: "stale", prediction: null, predictionUnavailable: "stale", cycleDay: null });
    // 第 90 天還算
    expect(computeCycleSummary(list, NO_DEFAULTS, addDays(list.at(-1)!.startDate, 89)).cycleDay).toBe(90);
  });

  it("預測跨年、跨閏年 2 月", () => {
    const yearEnd = computeCycleSummary(
      [period("2026-11-22"), period("2026-12-20")],
      { ...NO_DEFAULTS, defaultCycleLength: 28 },
      "2026-12-25",
    );
    expect(yearEnd.prediction?.startDate).toBe("2027-01-17");

    const leap = computeCycleSummary([period("2024-02-10")], { ...NO_DEFAULTS, defaultCycleLength: 28 }, "2024-02-20");
    expect(leap.prediction).toMatchObject({
      startDate: "2024-03-09",
      windowStart: "2024-03-06",
      windowEnd: "2024-03-12",
    });
  });

  it("關閉預測：仍有統計，但不預測", () => {
    const s = computeCycleSummary(
      history("2026-08-01", [28, 30]),
      { ...NO_DEFAULTS, predictionEnabled: false },
      "2026-10-05",
    );
    expect(s).toMatchObject({ prediction: null, predictionUnavailable: "disabled", status: "waiting" });
    expect(s.stats.personalCycleLength).toBe(29);
  });
});

describe("分析統計", () => {
  it("資料不足時平均為 null，不用預設值充數；最近週期含異常", () => {
    expect(computeAnalytics([period("2026-11-01")])).toMatchObject({
      periodCount: 1,
      cycleCount: 0,
      averageCycleLength: null,
      averagePeriodLength: 5,
      recentCycles: [],
    });
    const a = computeAnalytics(history("2025-06-01", [28, 10, 30, 29]));
    expect(a.cycleCount).toBe(3);
    expect(a.averageCycleLength).toBe(29);
    expect(a.recentCycles.map((c) => [c.length, c.issue])).toEqual([
      [28, null],
      [10, "too_short"],
      [30, null],
      [29, null],
    ]);
  });
});

describe("月曆標示", () => {
  const today = "2026-11-22";
  const periods = [period("2026-11-01", "2026-11-05"), period("2026-11-20", null), period("2026-10-30", "2026-10-30")];

  it("實際經期：開始／中間／結束；進行中只標到今天", () => {
    const cells = [
      "2026-10-30",
      "2026-11-01",
      "2026-11-03",
      "2026-11-05",
      "2026-11-06",
      "2026-11-20",
      "2026-11-22",
      "2026-11-23",
    ].map((date) => ({ date, inMonth: true }));
    const marks = markDays(cells, { periods, logDates: ["2026-11-03"], prediction: null, today });
    expect(marks.map((m) => m.period?.position ?? null)).toEqual([
      "single",
      "start",
      "middle",
      "end",
      null,
      "start",
      "middle",
      null,
    ]);
    expect(marks[5].period?.ongoing).toBe(true);
    expect(marks[2].hasLog).toBe(true);
    expect(marks[6]).toMatchObject({ isToday: true, isFuture: false });
    expect(marks[7].isFuture).toBe(true);
  });

  it("預測與實際分開標；預測不會蓋在實際經期上", () => {
    const summary = computeCycleSummary(
      [period("2026-10-01", "2026-10-05"), period("2026-10-29", "2026-11-02")],
      { ...NO_DEFAULTS, defaultCycleLength: 28 },
      "2026-11-10",
    );
    const prediction = summary.prediction!;
    expect(prediction).toMatchObject({
      startDate: "2026-11-26",
      windowStart: "2026-11-23",
      windowEnd: "2026-11-29",
      endDate: "2026-11-30",
    });
    const weeks = monthMarks("2026-11", { periods: [], logDates: [], prediction, today: "2026-11-10" });
    const byDate = new Map(weeks.flat().map((m) => [m.date, m]));
    expect(byDate.get("2026-11-22")).toMatchObject({ predictedWindow: false, predictedPeriod: false });
    expect(byDate.get("2026-11-23")).toMatchObject({ predictedWindow: true, predictedPeriod: false });
    expect(byDate.get("2026-11-26")).toMatchObject({ predictedWindow: true, predictedPeriod: true });
    expect(byDate.get("2026-11-30")).toMatchObject({ predictedWindow: false, predictedPeriod: true });
    expect(byDate.get("2026-12-01")).toMatchObject({ inMonth: false, predictedPeriod: false });

    const overlapping = markDays([{ date: "2026-11-26", inMonth: true }], {
      periods: [period("2026-11-25", null)],
      logDates: [],
      prediction,
      today: "2026-11-27",
    });
    expect(overlapping[0]).toMatchObject({ predictedWindow: false, predictedPeriod: false });
    expect(overlapping[0].period).not.toBeNull();
  });
});

describe("經期重疊規則", () => {
  const closed = { id: "a", startDate: "2026-10-01", endDate: "2026-10-05" };
  const open = { id: "b", startDate: "2026-11-01", endDate: null };

  it("已有進行中的經期，不能再開始一筆", () => {
    const hit = findPeriodConflict([closed, open], { startDate: "2026-11-05", endDate: null });
    expect(hit?.kind).toBe("open_exists");
    expect(conflictMessage(hit!)).toContain("已有進行中的經期");
  });

  it("補登過去的經期沒填結束日，而且之後還有紀錄：要求填結束日", () => {
    const hit = findPeriodConflict([closed], { startDate: "2026-09-01", endDate: null });
    expect(hit?.kind).toBe("open_not_latest");
    expect(conflictMessage(hit!)).toContain("請一併填寫結束日期");
  });

  it("日期重疊（含與進行中的經期重疊）", () => {
    expect(findPeriodConflict([closed], { startDate: "2026-10-03", endDate: "2026-10-07" })?.kind).toBe("overlap");
    expect(findPeriodConflict([closed], { startDate: "2026-09-28", endDate: "2026-10-01" })?.kind).toBe("overlap");
    const withOpen = findPeriodConflict([open], { startDate: "2026-11-03", endDate: "2026-11-04" });
    expect(withOpen?.kind).toBe("overlap");
    expect(conflictMessage(withOpen!)).toContain("進行中");
    expect(conflictMessage(findPeriodConflict([closed], { startDate: "2026-10-05", endDate: "2026-10-06" })!)).toBe(
      "與 10/1–10/5 的經期重疊，請調整日期或編輯那一筆",
    );
  });

  it("相鄰不算重疊；編輯自己不算衝突", () => {
    expect(findPeriodConflict([closed], { startDate: "2026-10-06", endDate: "2026-10-08" })).toBeNull();
    expect(findPeriodConflict([closed], { startDate: "2026-09-25", endDate: "2026-09-30" })).toBeNull();
    expect(findPeriodConflict([closed, open], { startDate: "2026-11-02", endDate: null }, "b")).toBeNull();
    expect(findPeriodConflict([closed, open], { startDate: "2026-10-02", endDate: "2026-10-06" }, "a")).toBeNull();
    // 最新一筆之後開始新的經期
    expect(findPeriodConflict([closed], { startDate: "2026-10-29", endDate: null })).toBeNull();
  });
});
