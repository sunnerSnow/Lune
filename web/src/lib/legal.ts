/** 隱私權政策與使用條款的共用資訊 */
export const LEGAL_UPDATED_AT = "2026 年 11 月 13 日";

/**
 * 聯絡方式由部署環境的 LUNE_CONTACT_EMAIL 提供（不把個人信箱寫進程式碼）。
 * 正式上線前一定要設定；沒設時顯示提醒文字。
 */
export function contactLine(): string {
  const email = process.env.LUNE_CONTACT_EMAIL?.trim();
  return email ? `有任何問題，請寄信到 ${email}。` : "聯絡信箱尚未設定（正式上線前會補上）。";
}
