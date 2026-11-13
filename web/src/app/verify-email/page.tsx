import type { Metadata } from "next";
import { AuthNotice, AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailButton } from "./verify-email-button";

export const metadata: Metadata = { title: "驗證 Email" };

/**
 * 信裡的連結 /verify-email?token=…。
 * 要按按鈕才驗證：有些信箱會自動預先開啟信裡的連結（掃毒、預覽），開啟頁面本身不能把 token 用掉。
 */
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { token } = await searchParams;
  return (
    <AuthShell en="VERIFY EMAIL" title="驗證 Email">
      {typeof token === "string" && token ? (
        <VerifyEmailButton token={token} />
      ) : (
        <AuthNotice>連結不完整，請重新開啟信裡的連結。</AuthNotice>
      )}
    </AuthShell>
  );
}
