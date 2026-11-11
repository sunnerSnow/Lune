import { describe, expect, it } from "vitest";
import { dateInTimezone } from "@/lib/date/date-utils";
import { isValidTimezone } from "@/lib/today";

describe("伺服器端的今天（依瀏覽器時區）", () => {
  it("只接受 Intl 認得的時區名稱", () => {
    expect(isValidTimezone("Asia/Taipei")).toBe(true);
    expect(isValidTimezone("America/Los_Angeles")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("x".repeat(65))).toBe(false);
    expect(isValidTimezone(undefined)).toBe(false);
    expect(isValidTimezone(42)).toBe(false);
  });

  it("同一個時刻，台北與洛杉磯的今天可能差一天（不能用伺服器的 UTC 日期）", () => {
    const instant = new Date("2026-11-11T02:00:00Z");
    expect(dateInTimezone(instant, "Asia/Taipei")).toBe("2026-11-11");
    expect(dateInTimezone(instant, "America/Los_Angeles")).toBe("2026-11-10");
    expect(dateInTimezone(instant, "UTC")).toBe("2026-11-11");
  });
});
