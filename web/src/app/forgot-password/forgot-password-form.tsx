"use client";

import { type FormEvent, useId, useState, useTransition } from "react";
import { type AuthState, requestPasswordResetAction } from "@/app/actions";
import { AuthNotice } from "@/components/auth/auth-shell";
import { Icon } from "@/components/ui/icon";
import { forgotPasswordSchema } from "@/lib/validation/auth";

/** 輸入 Email → 寄出重設連結；不論帳號存不存在，完成畫面都一樣 */
export function ForgotPasswordForm() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<AuthState>({});
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      const message = parsed.error.issues[0].message;
      setState({ error: message, fieldErrors: { email: message } });
      return;
    }
    setState({});
    startTransition(async () => {
      setState(await requestPasswordResetAction(parsed.data));
    });
  };

  if (state.done) {
    return (
      <AuthNotice>
        如果這個 Email 有註冊 Luné，重設密碼的連結已經寄出，30 分鐘內有效。幾分鐘內沒收到的話，看看垃圾郵件匣。
      </AuthNotice>
    );
  }

  const emailError = state.fieldErrors?.email;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <p className="text-[13px] leading-relaxed tracking-wide text-ink-soft">
        輸入註冊時用的 Email，我們會寄一封重設密碼的連結給你。
      </p>
      {state.error && !emailError && (
        <p role="alert" className="field-error mt-4">
          <Icon name="info" size={14} />
          {state.error}
        </p>
      )}
      <div className="mt-4">
        <label htmlFor={`${id}-email`} className="field-label block">
          Email
        </label>
        <input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? `${id}-email-err` : undefined}
          className="field-input"
        />
        {emailError && (
          <p id={`${id}-email-err`} role="alert" className="field-error">
            {emailError}
          </p>
        )}
      </div>
      <div className="mt-6 flex justify-center">
        <button type="submit" disabled={pending} className="oval h-16 w-52 text-base">
          {pending ? "寄送中…" : "寄出重設連結"}
        </button>
      </div>
    </form>
  );
}
