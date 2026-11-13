"use client";

import { useState, useTransition } from "react";
import { resendVerificationAction } from "@/app/actions";
import { Icon } from "@/components/ui/icon";

/** 帳號區塊：Email 還沒驗證時可以重寄驗證信（重設密碼的信只會寄到這個信箱） */
export function EmailVerification() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="border-t border-line py-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await resendVerificationAction();
            setMessage(
              res.error
                ? { ok: false, text: res.error }
                : { ok: true, text: "驗證信已寄出，請到信箱點連結（也看看垃圾郵件匣）" },
            );
          })
        }
        className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-sm tracking-[0.14em]"
      >
        <span>
          Email 還沒驗證
          <span className="mt-0.5 block text-xs tracking-wider text-ink-soft">
            {pending ? "寄送中…" : "重寄驗證信"}
          </span>
        </span>
        <span className="circle-btn sm" aria-hidden="true">
          <Icon name="mail" size={16} />
        </span>
      </button>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "pb-1 text-xs tracking-wide" : "field-error"}>
          {!message.ok && <Icon name="info" size={14} />}
          {message.text}
        </p>
      )}
    </div>
  );
}
