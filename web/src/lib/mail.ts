import "server-only";
import nodemailer from "nodemailer";
import { type MailEnv, mailEnv } from "@/lib/config";
import type { Db } from "@/lib/db/local";
import { consumeRateLimit } from "@/lib/services/rate-limit";

/**
 * 寄信：Email 驗證、重設密碼、「這個 Email 已經註冊過」通知。
 * 信裡只有連結與操作說明，不放任何健康紀錄；純文字，不寄 HTML。
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  kind: "gmail" | "log" | "memory";
  send(message: MailMessage): Promise<void>;
}

const SMTP_TIMEOUT_MS = 10_000;

/** 依設定建立寄信器；provider=none 回 null，呼叫端據此關閉忘記密碼與 Email 驗證 */
export function createMailer(env: MailEnv = mailEnv()): Mailer | null {
  if (env.provider === "none") return null;
  if (env.provider === "log") {
    return {
      kind: "log",
      async send(message) {
        // 開發用：整封信印在伺服器日誌（含 token 連結），部署環境不允許這個模式（見 mailEnv）
        console.log(`[lune mail] to=${message.to} subject=${message.subject}\n${message.text}\n`);
      },
    };
  }
  const { user, appPassword } = env;
  if (!user || !appPassword) throw new Error("MAIL_PROVIDER=gmail 需要設定 GMAIL_USER 與 GMAIL_APP_PASSWORD");
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: appPassword },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
  return {
    kind: "gmail",
    async send(message) {
      try {
        await transport.sendMail({
          from: { name: "Luné", address: user },
          to: message.to,
          subject: message.subject,
          text: message.text,
        });
      } catch (error) {
        // 不把 SMTP 回應（可能含收件者）寫進錯誤；只留錯誤碼
        const e = error as { code?: string; responseCode?: number };
        throw new Error(`Gmail 寄信失敗：${e.code ?? "unknown"}${e.responseCode ? ` ${e.responseCode}` : ""}`);
      }
    },
  };
}

/**
 * 寄信額度（所有寄信路徑共用）：
 * - 同一個收件者每小時 5 封：別人一直按「忘記密碼」或拿你的 Email 註冊，最多吵到你 5 次。
 * - 全站每 24 小時 300 封：Gmail 個人帳號一天大約只能寄 500 封，超過會被暫停寄信；留一些餘裕。
 * 超過時丟 MailLimitError，不寄。
 */
export const MAIL_LIMITS = {
  perRecipient: { max: 5, windowSeconds: 3600 },
  daily: { max: 300, windowSeconds: 86_400 },
};

export class MailLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailLimitError";
  }
}

export function withMailLimits(db: Db, mailer: Mailer): Mailer {
  return {
    kind: mailer.kind,
    async send(message) {
      const to = message.to.trim().toLowerCase();
      // 收件者這層先擋：被擋下的不占全站額度
      const { perRecipient, daily } = MAIL_LIMITS;
      if (!(await consumeRateLimit(db, `mail:to:${to}`, perRecipient.max, perRecipient.windowSeconds))) {
        throw new MailLimitError("同一個收件者一小時內寄太多封");
      }
      if (!(await consumeRateLimit(db, "mail:daily", daily.max, daily.windowSeconds))) {
        throw new MailLimitError("今天的寄信額度已用完");
      }
      await mailer.send(message);
    },
  };
}

/** 信裡的連結：token 放在查詢參數，由頁面上的按鈕送進 Server Action 消耗 */
export function tokenLink(origin: string, path: "/verify-email" | "/reset-password", token: string): string {
  return `${origin}${path}?token=${encodeURIComponent(token)}`;
}

const SIGNATURE = ["", "Luné"];

export function emailVerificationMail(to: string, link: string): MailMessage {
  return {
    to,
    subject: "Luné：請驗證你的 Email",
    text: [
      "謝謝你註冊 Luné。",
      "",
      "請在 24 小時內開啟下面的連結，完成 Email 驗證：",
      link,
      "",
      "如果你沒有註冊，忽略這封信就好。",
      ...SIGNATURE,
    ].join("\n"),
  };
}

export function passwordResetMail(to: string, link: string): MailMessage {
  return {
    to,
    subject: "Luné：重設密碼",
    text: [
      "有人（可能是你）要求重設 Luné 帳號的密碼。",
      "",
      "請在 30 分鐘內開啟下面的連結設定新密碼：",
      link,
      "",
      "如果不是你提出的，忽略這封信就好，密碼不會改變。",
      ...SIGNATURE,
    ].join("\n"),
  };
}

/** 有人用已註冊的 Email 再註冊一次：註冊頁不說帳號存在，改寄這封給本人 */
export function existingAccountMail(to: string, origin: string): MailMessage {
  return {
    to,
    subject: "Luné：這個 Email 已經註冊過",
    text: [
      "剛才有人用這個 Email 申請註冊 Luné，但這個 Email 已經有帳號了。",
      "",
      "如果是你，直接登入就可以：",
      `${origin}/login`,
      "",
      "忘記密碼的話，可以在這裡重設：",
      `${origin}/forgot-password`,
      "",
      "如果不是你，忽略這封信就好，你的帳號沒有任何變更。",
      ...SIGNATURE,
    ].join("\n"),
  };
}
