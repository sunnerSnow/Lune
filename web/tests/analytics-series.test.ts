import { describe, expect, it } from "vitest";
import {
  cycleTrend,
  isRangeKey,
  moodCounts,
  rangeStart,
  symptomCounts,
  trendDomain,
} from "@/lib/cycle/analytics-series";

const p = (id: string, startDate: string, endDate: string | null = null) => ({ id, startDate, endDate });

describe("分析頁圖表資料", () => {
  it("時間範圍：含今天往回推，跨年正確；不認得的值不接受", () => {
    expect(rangeStart("3m", "2026-01-15")).toBe("2025-10-18");
    expect(rangeStart("12m", "2026-11-12")).toBe("2025-11-13");
    expect(isRangeKey("6m")).toBe(true);
    expect(isRangeKey("1y")).toBe(false);
    expect(isRangeKey("__proto__")).toBe(false);
  });

  it("週期趨勢：只取開始日在範圍內的完整週期；異常間隔保留並標記", () => {
    const periods = [
      p("a", "2026-05-01", "2026-05-05"),
      p("b", "2026-05-29", "2026-06-02"),
      p("c", "2026-06-05", "2026-06-08"), // 只隔 7 天：異常
      p("d", "2026-07-03"),
    ];
    expect(cycleTrend(periods, "2026-05-15")).toEqual([
      { startDate: "2026-05-29", nextStartDate: "2026-06-05", length: 7, issue: "too_short" },
      { startDate: "2026-06-05", nextStartDate: "2026-07-03", length: 28, issue: null },
    ]);
    expect(cycleTrend([p("x", "2026-05-01")], "2026-01-01")).toEqual([]);
  });

  it("症狀頻率：依天數排序、同數照選項順序、同一天重複只算一次、沒出現的不列", () => {
    const logs = [
      { symptoms: ["fatigue", "cramps"] as const, mood: "low" as const },
      { symptoms: ["cramps"] as const, mood: "low" as const },
      { symptoms: ["none"] as const, mood: "calm" as const },
      { symptoms: [] as const, mood: null },
      { symptoms: ["headache", "headache"] as const, mood: "calm" as const },
    ];
    expect(symptomCounts(logs.map((l) => ({ ...l, symptoms: [...l.symptoms] })))).toEqual([
      { key: "cramps", days: 2 },
      { key: "headache", days: 1 },
      { key: "fatigue", days: 1 },
      { key: "none", days: 1 },
    ]);
    expect(moodCounts(logs.map((l) => ({ ...l, symptoms: [...l.symptoms] })))).toEqual([
      { key: "low", days: 2 },
      { key: "calm", days: 2 },
    ]);
  });

  it("趨勢圖 y 軸：上下留空、刻度是 5 的倍數", () => {
    expect(trendDomain([27, 28, 31])).toEqual({ min: 25, max: 35, ticks: [25, 30, 35] });
    expect(trendDomain([29])).toEqual({ min: 25, max: 35, ticks: [25, 30, 35] });
    expect(trendDomain([7, 28])).toEqual({ min: 5, max: 30, ticks: [5, 10, 15, 20, 25, 30] });
  });
});
