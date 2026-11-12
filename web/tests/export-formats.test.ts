import { describe, expect, it } from "vitest";
import { csvCell, dailyLogsCsv, periodsCsv } from "@/lib/export/csv";
import { foldLine, icsText, isIcsTitle, predictionIcs } from "@/lib/export/ics";
import type { DailyLog, Period, Profile } from "@/lib/types";

type WithRecords = Profile & { periods: Period[]; dailyLogs: DailyLog[] };
const profile = (over: Partial<WithRecords> = {}): WithRecords => ({
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "我",
  avatarColor: null,
  defaultCycleLength: null,
  defaultPeriodLength: null,
  predictionEnabled: true,
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  periods: [],
  dailyLogs: [],
  ...over,
});
const ts = "2026-01-01T00:00:00.000Z";

describe("CSV 匯出", () => {
  it("引號、逗號、換行要包起來；使用者輸入以 = + - @ 開頭時加單引號防公式注入", () => {
    expect(csvCell("一般")).toBe("一般");
    expect(csvCell('有"引號"')).toBe('"有""引號"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("第一行\n第二行")).toBe('"第一行\n第二行"');
    expect(csvCell("=HYPERLINK(\"x\")", { userInput: true })).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1", { userInput: true })).toBe("'+1");
    expect(csvCell("-頭痛", { userInput: true })).toBe("'-頭痛");
    expect(csvCell("@me", { userInput: true })).toBe("'@me");
    expect(csvCell("2026-11-12")).toBe("2026-11-12");
    expect(csvCell(null)).toBe("");
  });

  it("經期與每日紀錄：BOM＋CRLF、中文標籤、進行中的經期", () => {
    const p = profile({
      displayName: "=媽媽",
      periods: [
        { id: "a", profileId: "x", startDate: "2026-10-01", endDate: "2026-10-05", notes: "有點痛, 但還好", createdAt: ts, updatedAt: ts },
        { id: "b", profileId: "x", startDate: "2026-10-29", endDate: null, notes: null, createdAt: ts, updatedAt: ts },
      ],
      dailyLogs: [
        { id: "c", profileId: "x", date: "2026-10-02", flow: "heavy", symptoms: ["cramps", "fatigue"], mood: "low", notes: null, createdAt: ts, updatedAt: ts },
      ],
    });
    const periods = periodsCsv([p]);
    expect(periods.startsWith("﻿Profile,開始日期,結束日期,天數,備註\r\n")).toBe(true);
    expect(periods).toContain("'=媽媽,2026-10-01,2026-10-05,5,\"有點痛, 但還好\"\r\n");
    expect(periods).toContain("'=媽媽,2026-10-29,,進行中,\r\n");
    const logs = dailyLogsCsv([p]);
    expect(logs).toContain("'=媽媽,2026-10-02,大量,經痛、疲勞,低落,\r\n");
  });
});

describe(".ics 匯出", () => {
  it("只有中性名稱可選", () => {
    expect(isIcsTitle("健康提醒")).toBe(true);
    expect(isIcsTitle("經期")).toBe(false);
  });

  it("全天事件：DTEND 是結束日的隔天；CRLF；沒有任何健康內容或 Profile 名稱", () => {
    const ics = predictionIcs(
      { windowStart: "2026-11-24", windowEnd: "2026-11-28" },
      { title: "健康提醒", profileId: "00000000-0000-4000-8000-000000000001", now: new Date("2026-11-12T05:06:07.890Z") },
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20261124\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261129\r\n");
    expect(ics).toContain("SUMMARY:健康提醒\r\n");
    expect(ics).toContain("DTSTAMP:20261112T050607Z\r\n");
    expect(ics).not.toMatch(/經期|經血|症狀|00000000-0000/);
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75)).toBe(true);
    // 跨年：12/30–1/2 → 結束日隔天 1/3
    const y = predictionIcs({ windowStart: "2026-12-30", windowEnd: "2027-01-02" }, { title: "Luné 提醒", profileId: "p" });
    expect(y).toContain("DTEND;VALUE=DATE:20270103\r\n");
    // 同一個 Profile、同一次預測 → 同一個 UID（重新匯入會更新而不是重複）
    const again = predictionIcs({ windowStart: "2026-11-24", windowEnd: "2026-11-28" }, { title: "個人行程", profileId: "00000000-0000-4000-8000-000000000001" });
    expect(again.match(/UID:(.+)\r\n/)?.[1]).toBe(ics.match(/UID:(.+)\r\n/)?.[1]);
  });

  it("文字跳脫與折行（不切斷中文字）", () => {
    expect(icsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const long = `DESCRIPTION:${"估算日期".repeat(20)}`;
    const folded = foldLine(long);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((l) => Buffer.byteLength(l, "utf8") <= 75)).toBe(true);
    expect(parts.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(parts.map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(long);
  });
});
