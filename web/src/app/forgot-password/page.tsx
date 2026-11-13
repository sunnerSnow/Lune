import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthNotice, AuthShell } from "@/components/auth/auth-shell";
import { mailReady } from "@/lib/config";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "忘記密碼" };

export default async function ForgotPasswordPage() {
  // 寄信設定要在執行時讀，不能在建置時就定下來
  await connection();
  return (
    <AuthShell en="FORGOT PASSWORD" title="忘記密碼">
      {mailReady() ? <ForgotPasswordForm /> : <AuthNotice>目前還沒有開放寄信，暫時無法在網站上重設密碼。</AuthNotice>}
    </AuthShell>
  );
}
