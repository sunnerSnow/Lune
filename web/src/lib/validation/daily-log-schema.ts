import { z } from "zod";
import { FLOWS, MOODS, SYMPTOMS, type Symptom } from "@/lib/types";
import { isoDate, notes } from "@/lib/validation/fields";

/**
 * 每日紀錄：日期以外全部選填，允許只記心情或備註。
 * 症狀去重並依固定順序排列；「無症狀」與其他症狀互斥。
 */
export const dailyLogSchema = z
  .object({
    date: isoDate,
    flow: z
      .enum(FLOWS, "不支援的經血量選項")
      .nullish()
      .transform((v) => v ?? null),
    symptoms: z
      .array(z.enum(SYMPTOMS, "不支援的症狀選項"))
      .max(SYMPTOMS.length)
      .nullish()
      .transform((list): Symptom[] => SYMPTOMS.filter((s) => (list ?? []).includes(s))),
    mood: z
      .enum(MOODS, "不支援的心情選項")
      .nullish()
      .transform((v) => v ?? null),
    notes,
  })
  .superRefine((v, ctx) => {
    if (v.symptoms.includes("none") && v.symptoms.length > 1) {
      ctx.addIssue({ code: "custom", path: ["symptoms"], message: "「無症狀」不能和其他症狀同時選" });
    }
  });
export type DailyLogInput = z.input<typeof dailyLogSchema>;
export type DailyLogValues = z.output<typeof dailyLogSchema>;

/** 除了日期以外全部沒填 */
export function isEmptyLog(v: DailyLogValues): boolean {
  return v.flow === null && v.symptoms.length === 0 && v.mood === null && v.notes === null;
}
