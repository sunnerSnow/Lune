"use client";

import { type ReactNode, useId } from "react";
import { Icon } from "@/components/ui/icon";
import type { ActionError } from "@/app/actions";

/** 表單欄位：上方標籤、下方錯誤（錯誤放在欄位旁，不只放在頂端） */
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mt-4">
      <label htmlFor={id} className="field-label block">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs tracking-wide text-ink-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="field-error">
          <Icon name="info" size={14} />
          {error}
        </p>
      )}
    </div>
  );
}

/** 一組選項的標題（radiogroup／多選用 fieldset） */
export function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="mt-4 border-0 p-0">
      <legend className="field-label mb-2">{legend}</legend>
      {children}
    </fieldset>
  );
}

export function FormError({ error }: { error: ActionError | null }) {
  if (!error || error.issues?.length) return null;
  return (
    <p role="alert" className="field-error mt-4">
      <Icon name="info" size={14} />
      {error.message}
    </p>
  );
}

/** ActionError 的欄位訊息 → { 欄位: 訊息 } */
export function fieldErrors(error: ActionError | null): Record<string, string> {
  return Object.fromEntries((error?.issues ?? []).map((i) => [i.field, i.message]));
}

/** 刪除前的二次確認 */
export function ConfirmDelete({
  label,
  confirming,
  pending,
  onAsk,
  onCancel,
  onConfirm,
}: {
  label: string;
  confirming: boolean;
  pending: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <button type="button" onClick={onAsk} className="inline-flex min-h-11 items-center gap-1.5 text-sm tracking-[0.14em]">
        <Icon name="trash" size={16} />
        {label}
      </button>
    );
  }
  return (
    <div role="group" aria-label="確認刪除" className="flex flex-wrap items-center gap-3 text-sm">
      <span className="tracking-wider">確定刪除？無法復原</span>
      <button type="button" onClick={onConfirm} disabled={pending} className="chip solid">
        {pending ? "刪除中…" : "刪除"}
      </button>
      <button type="button" onClick={onCancel} className="chip">
        取消
      </button>
    </div>
  );
}
