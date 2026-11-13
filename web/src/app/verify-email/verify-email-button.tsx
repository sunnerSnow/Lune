"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { verifyEmailAction } from "@/app/actions";
import { Icon } from "@/components/ui/icon";

/**
 * 按下才送出 token。驗證完不會自動登入（見 better-auth.ts）：
 * 「前往 Luné」連到登入頁，已經登入的人會直接被帶到首頁。
 */
export function VerifyEmailButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="flex flex-col">
        <p role="status" className="text-sm leading-relaxed tracking-wide">
          Email 驗證完成。
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/login" className="oval h-16 w-52 text-base">
            前往 Luné
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <p className="text-[13px] leading-relaxed tracking-wide text-ink-soft">按下按鈕，完成 Email 驗證。</p>
      {error && (
        <p role="alert" className="field-error mt-4">
          <Icon name="info" size={14} />
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await verifyEmailAction(token);
              if (res.error) setError(res.error);
              else if (res.done) setDone(true);
            })
          }
          className="oval h-16 w-52 text-base"
        >
          {pending ? "驗證中…" : "完成驗證"}
        </button>
      </div>
    </div>
  );
}
