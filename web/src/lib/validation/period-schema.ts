import { z } from "zod";
import { diffDays } from "@/lib/date/date-utils";
import { isoDate, notes } from "@/lib/validation/fields";

/** 單次經期最長天數（含頭尾），與資料庫 periods_dates_ck 一致 */
export const MAX_PERIOD_DAYS = 60;

/** 開始經期：預設今天，可改日期；備註選填 */
export const startPeriodSchema = z.object({
  startDate: isoDate,
  notes,
});
export type StartPeriodInput = z.input<typeof startPeriodSchema>;

/** 結束目前進行中的經期 */
export const endPeriodSchema = z.object({
  endDate: isoDate,
});
export type EndPeriodInput = z.input<typeof endPeriodSchema>;

/** 補登或編輯一次經期；結束日可留空（＝進行中） */
export const periodInputSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate.nullish().transform((v) => v ?? null),
    notes,
  })
  .superRefine((v, ctx) => {
    if (v.endDate === null) return;
    if (v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "結束日期不能早於開始日期" });
    } else if (diffDays(v.startDate, v.endDate) + 1 > MAX_PERIOD_DAYS) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: `單次經期最長 ${MAX_PERIOD_DAYS} 天，請檢查日期` });
    }
  });
export type PeriodFormInput = z.input<typeof periodInputSchema>;
