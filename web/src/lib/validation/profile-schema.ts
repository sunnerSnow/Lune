import { z } from "zod";
import { AVATAR_COLORS } from "@/lib/types";

/** 新增 Profile：只有名稱必填；週期預設值選填（沒填就等累積紀錄後用個人平均） */
export const profileInputSchema = z.object({
  displayName: z.string("請輸入名稱").trim().min(1, "請輸入名稱").max(30, "名稱最多 30 個字"),
  avatarColor: z.enum(AVATAR_COLORS, "不支援的顏色").nullish(),
  defaultCycleLength: z
    .number("週期長度要是數字")
    .int("週期長度要是整數")
    .min(15, "週期長度要在 15–90 天之間")
    .max(90, "週期長度要在 15–90 天之間")
    .nullish(),
  defaultPeriodLength: z
    .number("經期天數要是數字")
    .int("經期天數要是整數")
    .min(1, "經期天數要在 1–14 天之間")
    .max(14, "經期天數要在 1–14 天之間")
    .nullish(),
  predictionEnabled: z.boolean().optional(),
});
export type ProfileInput = z.input<typeof profileInputSchema>;

/** 編輯 Profile：每個欄位都可省略（省略＝不變；null＝清空） */
export const profileUpdateSchema = profileInputSchema.partial();
export type ProfileUpdate = z.input<typeof profileUpdateSchema>;
