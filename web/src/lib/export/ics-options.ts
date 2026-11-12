/** .ics 匯出的選項（前端預覽與伺服器產生檔案共用；這個檔案不能用 Node 專屬的模組） */
export const ICS_TITLES = ["健康提醒", "Luné 提醒", "個人行程"] as const;
export type IcsTitle = (typeof ICS_TITLES)[number];

export function isIcsTitle(value: unknown): value is IcsTitle {
  return typeof value === "string" && (ICS_TITLES as readonly string[]).includes(value);
}

export const ICS_DESCRIPTION = "Luné 依過去紀錄估算的日期區間，僅供參考，不能作為避孕或醫療判斷依據。";
