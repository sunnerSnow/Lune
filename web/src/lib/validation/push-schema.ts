import { z } from "zod";

/**
 * 推播訂閱（瀏覽器 PushSubscription.toJSON()）。
 * endpoint 只接受各家瀏覽器的推播服務：排程會從伺服器對 endpoint 發 POST，
 * 不限制網域的話，任何人都能讓伺服器去打任意網址（SSRF）。
 * - Chrome、Edge（新版）、Opera、Samsung：fcm.googleapis.com
 * - Firefox：*.push.services.mozilla.com
 * - Windows 上的 Edge 舊版通道：*.notify.windows.com
 * - Safari（macOS、iOS 16.4 以上加到主畫面）：*.push.apple.com
 */
const PUSH_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
];

/**
 * 主機部分只能是小寫英數、- 與 .，後面直接接 /。
 * 驗證用 WHATWG URL，web-push 送出時用舊的 url.parse：兩者對 %、@、\、: 等字元的解讀不同，
 * 例如 https://127.0.0.1%2Epush.apple.com/ 在 WHATWG 是 *.push.apple.com，url.parse 卻會連到 127.0.0.1。
 * 先擋掉這些字元，兩邊才會解析出同一個主機。
 */
const PLAIN_AUTHORITY = /^https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)*)\//;

export function isPushEndpoint(value: string): boolean {
  const match = PLAIN_AUTHORITY.exec(value);
  // 主機名稱最長 253 字元；超過時舊的 url.parse 會把主機解析成空字串
  if (!match || match[1].length > 253) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  // 存進資料庫、拿去送的字串要跟驗證時看到的完全一樣（已是正規化後的網址）
  return url.href === value && url.hostname === match[1] && PUSH_HOSTS.some((re) => re.test(url.hostname));
}

/** base64url（可帶 = 補位），解碼後長度要剛好 bytes */
function b64url(bytes: number, message: string) {
  return z
    .string(message)
    .max(200, message)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/, message)
    .refine((v) => Buffer.from(v.replace(/=+$/, ""), "base64url").length === bytes, message);
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.string("訂閱資料不完整").max(1000, "訂閱資料不完整").refine(isPushEndpoint, "這個瀏覽器的推播服務不支援"),
  keys: z.object({
    // P-256 公鑰（未壓縮，65 bytes）與 16 bytes 的 auth secret
    p256dh: b64url(65, "訂閱資料不完整"),
    auth: b64url(16, "訂閱資料不完整"),
  }),
});
export type PushSubscriptionInput = z.input<typeof pushSubscriptionSchema>;

/** 設定頁的提醒設定（目前的 Profile） */
export const reminderSettingsSchema = z.object({
  remindBeforeDays: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()], "提醒天數要在 1–3 天之間"),
  remindInactive: z.boolean("設定資料不完整"),
});
