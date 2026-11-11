import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dateInTimezone,
  daysInMonth,
  diffDays,
  formatDate,
  formatDateRange,
  inclusiveDays,
  isIsoDate,
  isPlausibleToday,
  isYearMonth,
  monthGrid,
  weekday,
} from "@/lib/date/date-utils";

describe("isIsoDate", () => {
  it("只接受真實存在的 YYYY-MM-DD", () => {
    expect(isIsoDate("2026-11-11")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-1")).toBe(false);
    expect(isIsoDate("2026-11-11T00:00:00Z")).toBe(false);
    expect(isIsoDate(20261111)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe("addDays／diffDays", () => {
  it("跨月、跨年、閏年", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-11-11", 0)).toBe("2026-11-11");
  });

  it("天數差與含頭尾天數", () => {
    expect(diffDays("2026-12-20", "2027-01-17")).toBe(28);
    expect(diffDays("2024-02-01", "2024-03-01")).toBe(29);
    expect(diffDays("2026-02-01", "2026-03-01")).toBe(28);
    expect(diffDays("2026-11-11", "2026-11-01")).toBe(-10);
    expect(inclusiveDays("2026-11-01", "2026-11-05")).toBe(5);
    expect(inclusiveDays("2026-11-01", "2026-11-01")).toBe(1);
  });

  it("夏令時間的國家也不會差一天（全部用 UTC 運算）", () => {
    // 美國 2026-03-08 進入夏令時間；本機時區是什麼都不影響
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(diffDays("2026-03-01", "2026-04-01")).toBe(31);
  });
});

describe("時區", () => {
  it("同一個時刻在台灣與 UTC 可能是不同天", () => {
    const instant = new Date("2026-11-10T20:30:00Z"); // 台灣 11/11 04:30
    expect(dateInTimezone(instant, "Asia/Taipei")).toBe("2026-11-11");
    expect(dateInTimezone(instant, "UTC")).toBe("2026-11-10");
    expect(dateInTimezone(instant, "America/Los_Angeles")).toBe("2026-11-10");
  });

  it("前端傳來的今天只能和 UTC 日期差一天以內", () => {
    const now = new Date("2026-11-10T20:30:00Z");
    expect(isPlausibleToday("2026-11-10", now)).toBe(true);
    expect(isPlausibleToday("2026-11-11", now)).toBe(true);
    expect(isPlausibleToday("2026-11-09", now)).toBe(true);
    expect(isPlausibleToday("2026-11-12", now)).toBe(false);
    expect(isPlausibleToday("2026-11-08", now)).toBe(false);
    expect(isPlausibleToday("not-a-date", now)).toBe(false);
    // 跨年
    const newYear = new Date("2026-12-31T23:00:00Z");
    expect(isPlausibleToday("2027-01-01", newYear)).toBe(true);
  });
});

describe("月份與月曆格", () => {
  it("月份加減與天數", () => {
    expect(addMonths("2026-11", 1)).toBe("2026-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(addMonths("2026-11", -23)).toBe("2024-12");
    expect(daysInMonth("2024-02")).toBe(29);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(isYearMonth("2026-11")).toBe(true);
    expect(isYearMonth("2026-13")).toBe(false);
  });

  it("週日開頭，前後補相鄰月份到整週", () => {
    // 2026-11-01 是週日、11-30 是週一
    const nov = monthGrid("2026-11");
    expect(nov).toHaveLength(5);
    expect(nov[0][0]).toEqual({ date: "2026-11-01", inMonth: true });
    expect(nov[4][0]).toEqual({ date: "2026-11-29", inMonth: true });
    expect(nov[4][6]).toEqual({ date: "2026-12-05", inMonth: false });
    for (const week of nov) expect(week).toHaveLength(7);

    // 2027-01-01 是週五：前面補 2026-12-27～31
    const jan = monthGrid("2027-01");
    expect(jan[0].slice(0, 5).map((c) => c.inMonth)).toEqual([false, false, false, false, false]);
    expect(jan[0][0].date).toBe("2026-12-27");
    expect(jan[0][5]).toEqual({ date: "2027-01-01", inMonth: true });
    expect(jan).toHaveLength(6);

    // 2026-02 從週日開始、28 天：剛好 4 週
    expect(monthGrid("2026-02")).toHaveLength(4);
    // 閏年 2 月有 29 號
    const feb2024 = monthGrid("2024-02").flat();
    expect(feb2024.filter((c) => c.inMonth)).toHaveLength(29);
  });

  it("每一格都依序相差一天", () => {
    const cells = monthGrid("2026-03").flat();
    for (let i = 1; i < cells.length; i++) expect(diffDays(cells[i - 1].date, cells[i].date)).toBe(1);
    expect(weekday(cells[0].date)).toBe(0);
  });
});

describe("顯示格式", () => {
  it("中文日期", () => {
    expect(formatDate("2026-11-11")).toBe("11 月 11 日（週三）");
    expect(formatDate("2024-02-29")).toBe("2 月 29 日（週四）");
    expect(formatDateRange("2026-11-01", "2026-11-05")).toBe("11/1–11/5");
    expect(formatDateRange("2026-11-01", "2026-11-01")).toBe("11/1");
  });
});
