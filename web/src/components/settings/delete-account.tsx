"use client";

import { useId, useState, useTransition } from "react";
import { deleteAccountAction } from "@/app/actions";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";

/**
 * 刪除帳號：說明後果 → 勾選確認 → 重新輸入密碼。
 * 成功時 Server Action 直接導回登入頁；錯誤（密碼不對、次數太多）顯示在欄位下方。
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  const close = () => {
    setOpen(false);
    setUnderstood(false);
    setPassword("");
    setError(null);
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteAccountAction(password);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center justify-between border-t border-line text-left text-sm tracking-[0.14em]"
      >
        刪除帳號與所有資料
        <span className="circle-btn sm" aria-hidden="true">
          <Icon name="trash" size={16} />
        </span>
      </button>
      {open && (
        <Sheet open onClose={close} title="刪除帳號">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed tracking-wide">
            <li>帳號、所有 Profile、經期與每日紀錄會立刻永久刪除，無法復原。</li>
            <li>需要保留紀錄的話，請先在設定頁「下載我的資料」。</li>
          </ul>
          <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-3 text-sm tracking-wider">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="size-5 accent-white"
            />
            我了解刪除後無法復原
          </label>
          <div className="mt-4">
            <label htmlFor={`${id}-pw`} className="field-label block">
              請輸入密碼確認
            </label>
            <input
              id={`${id}-pw`}
              type="password"
              autoComplete="current-password"
              className="field-input"
              value={password}
              maxLength={72}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-err` : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p id={`${id}-err`} role="alert" className="field-error">
                <Icon name="info" size={14} />
                {error}
              </p>
            )}
          </div>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={submit}
              disabled={!understood || password.length === 0 || pending}
              className="oval h-16 w-52 text-base"
            >
              {pending ? "刪除中…" : "永久刪除帳號"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
