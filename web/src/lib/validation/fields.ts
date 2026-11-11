import { z } from "zod";
import { isIsoDate } from "@/lib/date/date-utils";

/** 共用欄位：日期一律 YYYY-MM-DD，而且是真實存在的日期 */
export const isoDate = z
  .string("請選擇日期")
  .refine(isIsoDate, "日期格式不正確")
  .refine((d) => d >= "1900-01-01", "日期太早了");

/** 備註：前後空白去掉，空字串視為沒填 */
export const notes = z
  .string()
  .trim()
  .max(500, "備註最多 500 個字")
  .nullish()
  .transform((v) => (v ? v : null));
