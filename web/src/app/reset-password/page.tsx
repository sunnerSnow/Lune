import type { Metadata } from "next";
import Link from "next/link";
import { AuthNotice, AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "重設密碼" };

/** 信裡的連結 /reset-password?token=…：token 由表單送出時才消耗，開啟頁面不會用掉 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  return (
    <AuthShell en="RESET PASSWORD" title="設定新密碼">
      {typeof token === "string" && token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <AuthNotice>
          連結不完整。請重新開啟信裡的連結，或
          <Link href="/forgot-password" className="mx-1 underline underline-offset-4 hover:text-white">
            重新申請重設密碼
          </Link>
          。
        </AuthNotice>
      )}
    </AuthShell>
  );
}
