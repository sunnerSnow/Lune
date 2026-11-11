import { describe, expect, it } from "vitest";
import { dailyLogSchema, isEmptyLog } from "@/lib/validation/daily-log-schema";
import { periodInputSchema } from "@/lib/validation/period-schema";
import { profileInputSchema } from "@/lib/validation/profile-schema";

describe("每日紀錄驗證", () => {
  it("只填日期以外的部分欄位即可；症狀去重並依固定順序", () => {
    const v = dailyLogSchema.parse({ date: "2026-11-11", symptoms: ["fatigue", "cramps", "fatigue"] });
    expect(v).toEqual({ date: "2026-11-11", flow: null, symptoms: ["cramps", "fatigue"], mood: null, notes: null });
    expect(dailyLogSchema.parse({ date: "2026-11-11", mood: "calm" }).mood).toBe("calm");
  });

  it("「無症狀」與其他症狀互斥", () => {
    const r = dailyLogSchema.safeParse({ date: "2026-11-11", symptoms: ["none", "headache"] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toContain("無症狀");
    expect(dailyLogSchema.safeParse({ date: "2026-11-11", symptoms: ["none"] }).success).toBe(true);
  });

  it("不支援的選項與錯誤日期被拒；備註空白視為沒填", () => {
    expect(dailyLogSchema.safeParse({ date: "2026-11-11", flow: "huge" }).success).toBe(false);
    expect(dailyLogSchema.safeParse({ date: "2026-11-11", mood: "angry" }).success).toBe(false);
    expect(dailyLogSchema.safeParse({ date: "2026-02-30" }).success).toBe(false);
    expect(dailyLogSchema.safeParse({ date: "2026-11-11", notes: "x".repeat(501) }).success).toBe(false);
    const blank = dailyLogSchema.parse({ date: "2026-11-11", notes: "   " });
    expect(blank.notes).toBeNull();
    expect(isEmptyLog(blank)).toBe(true);
  });
});

describe("經期驗證", () => {
  it("結束日不可早於開始日、最長 60 天；結束日可留空", () => {
    expect(periodInputSchema.parse({ startDate: "2026-11-01" }).endDate).toBeNull();
    const early = periodInputSchema.safeParse({ startDate: "2026-11-05", endDate: "2026-11-04" });
    expect(early.error?.issues[0]).toMatchObject({ path: ["endDate"], message: "結束日期不可早於開始日期" });
    expect(periodInputSchema.safeParse({ startDate: "2026-01-01", endDate: "2026-03-01" }).success).toBe(true);
    expect(periodInputSchema.safeParse({ startDate: "2026-01-01", endDate: "2026-03-02" }).success).toBe(false);
  });
});

describe("Profile 驗證", () => {
  it("名稱必填、最多 30 字；週期預設值範圍", () => {
    expect(profileInputSchema.safeParse({ displayName: "  " }).success).toBe(false);
    expect(profileInputSchema.safeParse({ displayName: "媽".repeat(31) }).success).toBe(false);
    expect(profileInputSchema.safeParse({ displayName: "媽媽", defaultCycleLength: 14 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ displayName: "媽媽", defaultCycleLength: 28.5 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ displayName: "媽媽", defaultPeriodLength: 15 }).success).toBe(false);
    expect(profileInputSchema.parse({ displayName: " 妹妹 ", avatarColor: "sage" })).toMatchObject({
      displayName: "妹妹",
      avatarColor: "sage",
    });
  });
});
