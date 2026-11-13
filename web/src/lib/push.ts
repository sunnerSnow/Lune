import "server-only";
import webpush from "web-push";
import { type PushEnv, pushEnv } from "@/lib/config";

/**
 * 送 Web Push 通知（VAPID）。內容在伺服器端加密，瀏覽器廠商的推播服務（Google、Apple、Mozilla、Microsoft）看不到。
 * 通知內容一律中性：標題「Luné」，內文不提經期、症狀或 Profile 名稱（會出現在鎖定畫面）。
 */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  body: string;
  /** 點通知要打開的站內路徑（以 / 開頭） */
  url: string;
  /** 同一個 tag 的通知會互相取代，不會疊好幾則 */
  tag: string;
}

/** sent：推播服務收下了；gone：訂閱已失效（404／410），要刪掉；failed：其他錯誤，下次再試 */
export type PushResult = "sent" | "gone" | "failed";

export interface PushSender {
  send(target: PushTarget, message: PushMessage): Promise<PushResult>;
}

/** 裝置離線超過 12 小時就不送了：早上的提醒到晚上才跳出來沒有意義 */
const TTL_SECONDS = 12 * 60 * 60;
const TIMEOUT_MS = 10_000;

export function createPushSender(env: PushEnv | null = pushEnv()): PushSender | null {
  if (!env) return null;
  const vapidDetails = { subject: env.subject, publicKey: env.publicKey, privateKey: env.privateKey };
  return {
    async send(target, message) {
      // /\evil.example 在瀏覽器裡會被當成 //evil.example（別的網站）
      if (!message.url.startsWith("/") || message.url.startsWith("//") || message.url.includes("\\")) {
        throw new Error("通知連結只能是站內路徑");
      }
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify({ title: "Luné", body: message.body, url: message.url, tag: message.tag }),
          { vapidDetails, TTL: TTL_SECONDS, urgency: "normal", timeout: TIMEOUT_MS },
        );
        return "sent";
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return "gone";
        // endpoint 本身是可以送通知的網址，不寫進日誌；只留狀態碼
        console.error(`[lune push] 送出失敗：${status ?? (error as Error).name}`);
        return "failed";
      }
    },
  };
}
