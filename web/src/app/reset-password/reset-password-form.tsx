"use client";

import Link from "next/link";
import { type FormEvent, useId, useState, useTransition } from "react";
import { type AuthState, resetPasswordAction } from "@/app/actions";
import { Icon } from "@/components/ui/icon";
import { resetPasswordSchema } from "@/lib/validation/auth";

/** 新密碼輸入兩次；成功後 Server Action 導回登入頁（所有舊的登入都會失效） */
export function ResetPasswordForm({ token }: { token: string }) {
  const id = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<AuthState>({});
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = resetPasswordSchema.safeParse({ token, password, confirm });
    if (!parsed.success) {
      setState({
        error: parsed.error.issues[0].message,
        fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
      });
      return;
    }
    setState({});
    startTransition(async () => {
      setState(await resetPasswordAction(parsed.data));
    });
  };

  const fieldError = (key: "password" | "confirm") => state.fieldErrors?.[key];
  const formError = state.error && !fieldError("password") && !fieldError("confirm") ? state.error : null;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      {formError && (
        <p role="alert" className="field-error">
          <Icon name="info" size={14} />
          <span>
            {formError}
            {/失效|用過/.test(formError) && (
              <Link href="/forgot-password" className="ml-1 underline underline-offset-4 hover:text-white">
                重新申請
              </Link>
            )}
          </span>
        </p>
      )}
      {(["password", "confirm"] as const).map((key) => (
        <div key={key} className="mt-4 first:mt-0">
          <label htmlFor={`${id}-${key}`} className="field-label block">
            {key === "password" ? "新密碼（至少 8 個字元）" : "再輸入一次新密碼"}
          </label>
          <input
            id={`${id}-${key}`}
            type="password"
            autoComplete="new-password"
            maxLength={72}
            value={key === "password" ? password : confirm}
            onChange={(e) => (key === "password" ? setPassword : setConfirm)(e.target.value)}
            aria-invalid={Boolean(fieldError(key))}
            aria-describedby={fieldError(key) ? `${id}-${key}-err` : undefined}
            className="field-input"
          />
          {fieldError(key) && (
            <p id={`${id}-${key}-err`} role="alert" className="field-error">
              {fieldError(key)}
            </p>
          )}
        </div>
      ))}
      <p className="mt-3 text-xs leading-relaxed tracking-wide text-ink-soft">
        設定完成後，其他裝置上的登入都會登出，請用新密碼重新登入。
      </p>
      <div className="mt-6 flex justify-center">
        <button type="submit" disabled={pending} className="oval h-16 w-52 text-base">
          {pending ? "處理中…" : "更新密碼"}
        </button>
      </div>
    </form>
  );
}
