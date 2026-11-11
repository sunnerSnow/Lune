"use client";

import { type FormEvent, useId, useState, useTransition } from "react";
import { type AuthState, loginAction } from "@/app/actions";
import { Icon } from "@/components/ui/icon";
import { credentialsSchema } from "@/lib/validation/auth";

/** 登入／註冊（同一個表單切換）；前端先驗證一次，伺服器再驗證一次 */
export function LoginForm() {
  const id = useId();
  const [intent, setIntent] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<AuthState>({});
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = credentialsSchema.safeParse({ email, password, name: intent === "signup" ? name : undefined });
    if (!parsed.success) {
      setState({
        error: parsed.error.issues[0].message,
        fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
      });
      return;
    }
    setState({});
    startTransition(async () => {
      setState(await loginAction(intent, parsed.data));
    });
  };

  const fieldError = (key: string) => state.fieldErrors?.[key];

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <div role="tablist" aria-label="登入或註冊" className="grid grid-cols-2 gap-2">
        {(["signin", "signup"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={intent === v}
            onClick={() => {
              setIntent(v);
              setState({});
            }}
            className="chip justify-center"
          >
            {v === "signin" ? "登入" : "註冊"}
          </button>
        ))}
      </div>

      {state.error && (
        <p role="alert" className="field-error mt-4">
          <Icon name="info" size={14} />
          {state.error}
        </p>
      )}

      {intent === "signup" && (
        <div className="mt-4">
          <label htmlFor={`${id}-name`} className="field-label block">
            顯示名稱（選填）
          </label>
          <input
            id={`${id}-name`}
            autoComplete="nickname"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            className="field-input"
            aria-describedby={`${id}-name-hint`}
          />
          <p id={`${id}-name-hint`} className="mt-1.5 text-xs tracking-wide text-ink-soft">
            也會是第一個 Profile 的名稱；留空就用 Email 的帳號部分
          </p>
        </div>
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
          aria-invalid={Boolean(fieldError("email"))}
          className="field-input"
        />
        {fieldError("email") && <p className="field-error">{fieldError("email")}</p>}
      </div>
      <div className="mt-4">
        <label htmlFor={`${id}-password`} className="field-label block">
          密碼（至少 8 個字元）
        </label>
        <input
          id={`${id}-password`}
          type="password"
          autoComplete={intent === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(fieldError("password"))}
          className="field-input"
        />
        {fieldError("password") && <p className="field-error">{fieldError("password")}</p>}
      </div>
      <div className="mt-6 flex justify-center">
        <button type="submit" disabled={pending} className="oval h-16 w-48 text-base">
          {pending ? "處理中…" : intent === "signup" ? "建立帳號" : "登入"}
        </button>
      </div>
    </form>
  );
}
