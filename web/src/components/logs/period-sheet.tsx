"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  type ActionError,
  createPeriodAction,
  deletePeriodAction,
  endPeriodAction,
  startPeriodAction,
  updatePeriodAction,
} from "@/app/actions";
import { ConfirmDelete, Field, fieldErrors, FormError } from "@/components/logs/form-bits";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatShortDate, localToday } from "@/lib/date/date-utils";
import type { Period } from "@/lib/types";

export type PeriodMode =
  | { kind: "start" }
  | { kind: "end"; period: Period }
  | { kind: "create"; startDate?: string }
  | { kind: "edit"; period: Period };

const TITLES: Record<PeriodMode["kind"], string> = {
  start: "開始生理期",
  end: "結束生理期",
  create: "補登經期",
  edit: "編輯經期",
};

/**
 * 經期的開始／結束／補登／編輯。
 * 重疊、第二筆進行中、結束早於開始等規則由服務層與資料庫把關，這裡只顯示錯誤訊息。
 */
export function PeriodSheet({
  open,
  onClose,
  profileId,
  today,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string;
  today: string;
  mode: PeriodMode;
}) {
  const router = useRouter();
  const toast = useToast();
  const initial =
    mode.kind === "edit"
      ? { start: mode.period.startDate, end: mode.period.endDate ?? "", notes: mode.period.notes ?? "" }
      : mode.kind === "create"
        ? { start: mode.startDate ?? "", end: "", notes: "" }
        : { start: today, end: today, notes: "" };
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState<ActionError | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const errors = fieldErrors(error);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const now = localToday();
      const body = { startDate: start, endDate: end || null, notes };
      const res =
        mode.kind === "start"
          ? await startPeriodAction(profileId, { startDate: start, notes }, now)
          : mode.kind === "end"
            ? await endPeriodAction(profileId, { endDate: end }, now)
            : mode.kind === "create"
              ? await createPeriodAction(profileId, body, now)
              : await updatePeriodAction(mode.period.id, body, now);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const p = res.value;
      toast.success(
        mode.kind === "start"
          ? `已記錄 ${formatShortDate(p.startDate)} 開始`
          : mode.kind === "end"
            ? `已記錄 ${formatShortDate(p.endDate ?? end)} 結束`
            : "已儲存經期",
      );
      router.refresh();
      onClose();
    });
  };

  const remove = () => {
    if (mode.kind !== "edit") return;
    startTransition(async () => {
      const res = await deletePeriodAction(mode.period.id);
      if (!res.ok) {
        setError(res.error);
        setConfirming(false);
        return;
      }
      toast.success("已刪除這次經期");
      router.refresh();
      onClose();
    });
  };

  const showStart = mode.kind !== "end";
  const showEnd = mode.kind !== "start";

  return (
    <Sheet open={open} onClose={onClose} title={TITLES[mode.kind]}>
      {mode.kind === "end" && (
        <p className="mt-1 text-sm tracking-wider">
          這次經期從 <span className="font-en">{formatDate(mode.period.startDate)}</span> 開始
        </p>
      )}

      {showStart && (
        <Field
          label="開始日期"
          error={errors.startDate}
          hint={mode.kind === "start" ? "預設今天；忘了記錄可以改成實際開始的日期" : undefined}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="date"
              className="field-input font-en"
              value={start}
              max={today}
              required
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => setStart(e.target.value)}
            />
          )}
        </Field>
      )}

      {showEnd && (
        <Field
          label={mode.kind === "end" ? "結束日期" : "結束日期（選填）"}
          error={errors.endDate}
          hint={mode.kind === "end" ? "預設今天" : "還沒結束可以留空；同時只能有一筆進行中的經期"}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="date"
              className="field-input font-en"
              value={end}
              min={(mode.kind === "end" ? mode.period.startDate : start) || undefined}
              max={today}
              required={mode.kind === "end"}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => setEnd(e.target.value)}
            />
          )}
        </Field>
      )}

      {showStart && (
        <Field label="備註" error={errors.notes}>
          {({ id, describedBy, invalid }) => (
            <textarea
              id={id}
              rows={2}
              maxLength={500}
              className="field-input resize-none"
              placeholder="選填"
              value={notes}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
      )}

      <FormError error={error} />

      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || (showStart && !start) || (mode.kind === "end" && !end)}
          className="oval h-16 w-48 text-base"
        >
          {pending ? "儲存中…" : mode.kind === "start" ? "開始" : mode.kind === "end" ? "結束" : "儲存"}
        </button>
        {mode.kind === "edit" && (
          <ConfirmDelete
            label="刪除這次經期"
            confirming={confirming}
            pending={pending}
            onAsk={() => setConfirming(true)}
            onCancel={() => setConfirming(false)}
            onConfirm={remove}
          />
        )}
      </div>
    </Sheet>
  );
}
