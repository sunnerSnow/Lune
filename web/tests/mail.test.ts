import { afterEach, describe, expect, it, vi } from "vitest";
import { appOrigin, mailEnv, mailReady, requireEmailVerification } from "@/lib/config";
import { createMailer, emailVerificationMail, existingAccountMail, passwordResetMail, tokenLink } from "@/lib/mail";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("寄信設定", () => {
  it("沒設 MAIL_PROVIDER：測試與正式建置都不寄信", () => {
    vi.stubEnv("MAIL_PROVIDER", "");
    expect(mailEnv().provider).toBe("none");
    expect(createMailer()).toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    expect(mailEnv().provider).toBe("none");
    vi.stubEnv("NODE_ENV", "development");
    expect(mailEnv().provider).toBe("log");
  });

  it("gmail 要有帳號與應用程式密碼；應用程式密碼的空白會去掉", () => {
    vi.stubEnv("MAIL_PROVIDER", "gmail");
    vi.stubEnv("GMAIL_USER", "");
    vi.stubEnv("GMAIL_APP_PASSWORD", "");
    expect(() => mailEnv()).toThrow(/GMAIL_USER/);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(mailReady()).toBe(false);

    vi.stubEnv("GMAIL_USER", "sender@example.test");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
    expect(mailEnv()).toEqual({ provider: "gmail", user: "sender@example.test", appPassword: "abcdefghijklmnop" });
    expect(mailReady()).toBe(true);
    // 建立寄信器不會連線，真正寄信時才連 smtp.gmail.com
    expect(createMailer()?.kind).toBe("gmail");
  });

  it("log 模式不能用在部署環境；不認得的值直接報錯", () => {
    vi.stubEnv("MAIL_PROVIDER", "log");
    vi.stubEnv("VERCEL", "1");
    expect(() => mailEnv()).toThrow(/部署環境/);
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("MAIL_PROVIDER", "resend");
    expect(() => mailEnv()).toThrow(/不支援/);
  });

  it("要求驗證 Email：要設旗標、有寄信服務、而且不是本機示範模式", () => {
    vi.stubEnv("AUTH_REQUIRE_EMAIL_VERIFICATION", "1");
    vi.stubEnv("MAIL_PROVIDER", "gmail");
    vi.stubEnv("GMAIL_USER", "sender@example.test");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcdefghijklmnop");
    vi.stubEnv("DATABASE_URL", "");
    expect(requireEmailVerification()).toBe(false);
    vi.stubEnv("DATABASE_URL", "postgres://user:pw@localhost:5432/db");
    expect(requireEmailVerification()).toBe(true);
    vi.stubEnv("MAIL_PROVIDER", "none");
    expect(requireEmailVerification()).toBe(false);
  });
});

describe("信裡的網址", () => {
  it("只看設定、不看請求：BETTER_AUTH_URL → Vercel 正式網域 → 預覽網址 → 本機", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://lune.example.test/some/path");
    expect(appOrigin()).toBe("https://lune.example.test");
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "lune-prod.example.test");
    vi.stubEnv("VERCEL_URL", "lune-git-abc.example.test");
    expect(appOrigin()).toBe("https://lune-prod.example.test");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(appOrigin()).toBe("https://lune-git-abc.example.test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("PORT", "3350");
    expect(appOrigin()).toBe("http://localhost:3350");
    vi.stubEnv("BETTER_AUTH_URL", "not a url");
    expect(() => appOrigin()).toThrow(/BETTER_AUTH_URL/);
  });

  it("token 會編碼", () => {
    expect(tokenLink("https://x.test", "/reset-password", "a+b/c=")).toBe(
      "https://x.test/reset-password?token=a%2Bb%2Fc%3D",
    );
  });
});

describe("信件內容", () => {
  const SENSITIVE = /經期|生理|月經|症狀|心情|經血|排卵|懷孕/;

  it("三種信都帶 Luné 標題與正確連結，不出現任何健康相關字眼", () => {
    const mails = [
      emailVerificationMail("a@example.test", "https://x.test/verify-email?token=t1"),
      passwordResetMail("a@example.test", "https://x.test/reset-password?token=t2"),
      existingAccountMail("a@example.test", "https://x.test"),
    ];
    expect(mails[0].text).toContain("https://x.test/verify-email?token=t1");
    expect(mails[1].text).toContain("https://x.test/reset-password?token=t2");
    expect(mails[2].text).toContain("https://x.test/login");
    expect(mails[2].text).toContain("https://x.test/forgot-password");
    for (const m of mails) {
      expect(m.subject.startsWith("Luné：")).toBe(true);
      expect(m.to).toBe("a@example.test");
      expect(`${m.subject}\n${m.text}`).not.toMatch(SENSITIVE);
    }
  });
});
