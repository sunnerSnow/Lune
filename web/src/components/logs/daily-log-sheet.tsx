"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  type ActionError,
  deleteDailyLogAction,
  getDailyLogAction,
  saveDailyLogAction,
} from "@/app/actions";
import { ConfirmDelete, Field, fieldErrors, FormError, Group } from "@/components/logs/form-bits";
import { Drops, Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatShortDate, localToday } from "@/lib/date/date-utils";
import { FLOW_LABELS, MOOD_LABELS, SYMPTOM_LABELS } from "@/lib/labels";
import { type DailyLog, FLOWS, type Flow, type Mood, MOODS, type Symptom, SYMPTOMS } from "@/lib/types";

const FLOW_DROPS: Record<Flow, number> = { none: 0, light: 1, medium: 2, heavy: 3 };

/**
 * 每日紀錄：日期以外都可不填；同一天再次儲存是更新。
 * 換日期時載入那天既有的紀錄（同一天只有一筆，不會無意間產生重複或覆蓋）。
 */
export function DailyLogSheet({
  open,
  onClose,
  profileId,
  today,
  initialDate,
  initialLog,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string;
  today: string;
  initialDate: string;
  /** 已知那天的紀錄（null＝確定沒有）；undefined 表示要向伺服器查 */
  initialLog?: DailyLog | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(initialDate);
  const [existing, setExisting] = useState<DailyLog | null>(initialLog ?? null);
  const [loading, setLoading] = useState(initialLog === undefined);
  const [flow, setFlow] = useState<Flow | null>(initialLog?.flow ?? null);
  const [symptoms, setSymptoms] = useState<Symptom[]>(initialLog?.symptoms ?? []);
  const [mood, setMood] = useState<Mood | null>(initialLog?.mood ?? null);
  const [notes, setNotes] = useState(initialLog?.notes ?? "");
  const [error, setError] = useState<ActionError | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [checkedDate, setCheckedDate] = useState(initialLog === undefined ? null : initialDate);

  // 換日期（或一開始不知道有沒有紀錄）時，向伺服器查那天的紀錄
  useEffect(() => {
    if (checkedDate === date) return;
    let cancelled = false;
    getDailyLogAction(profileId, date).then((res) => {
      if (cancelled) return;
      setLoading(false);
      setCheckedDate(date);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const log = res.value;
      setExisting(log);
      setFlow(log?.flow ?? null);
      setSymptoms(log?.symptoms ?? []);
      setMood(log?.mood ?? null);
      setNotes(log?.notes ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [date, checkedDate, profileId]);

  const toggleSymptom = (s: Symptom) => {
    setSymptoms((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s);
      // 「無症狀」與其他症狀互斥
      if (s === "none") return ["none"];
      return [...prev.filter((x) => x !== "none"), s];
    });
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveDailyLogAction(profileId, { date, flow, symptoms, mood, notes }, localToday());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(res.value ? `已儲存 ${formatShortDate(date)} 的紀錄` : `已清除 ${formatShortDate(date)} 的紀錄`);
      router.refresh();
      onClose();
    });
  };

  const remove = () => {
    startTransition(async () => {
      const res = await deleteDailyLogAction(profileId, date);
      if (!res.ok) {
        setError(res.error);
        setConfirming(false);
        return;
      }
      toast.success(`已刪除 ${formatShortDate(date)} 的紀錄`);
      router.refresh();
      onClose();
    });
  };

  const errors = fieldErrors(error);
  const busy = pending || loading;
  const title = date === today ? "記錄今天" : existing ? "編輯紀錄" : "補登紀錄";

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <Field label="日期" error={errors.date}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            type="date"
            className="field-input font-en"
            value={date}
            max={today}
            required
            aria-describedby={describedBy}
            aria-invalid={invalid}
            onChange={(e) => {
              if (!e.target.value) return;
              setConfirming(false);
              setLoading(true);
              setDate(e.target.value);
            }}
          />
        )}
      </Field>
      <p className="mt-1.5 text-xs tracking-wide text-ink-soft" aria-live="polite">
        {loading ? "讀取中…" : existing ? `${formatDate(date)} 已有紀錄，儲存會更新它` : formatDate(date)}
      </p>

      <Group legend="經血量">
        <div role="radiogroup" aria-label="經血量" className="grid grid-cols-4 gap-2">
          {FLOWS.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={flow === f}
              onClick={() => setFlow(flow === f ? null : f)}
              className="flow-opt"
            >
              <Drops count={FLOW_DROPS[f]} />
              {FLOW_LABELS[f]}
            </button>
          ))}
        </div>
      </Group>

      <Group legend="症狀（可複選）">
        <div className="flex flex-wrap gap-2">
          {SYMPTOMS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={symptoms.includes(s)}
              onClick={() => toggleSymptom(s)}
              className={s === "none" ? "chip dashed" : "chip"}
            >
              {symptoms.includes(s) && <Icon name="check" size={16} />}
              {SYMPTOM_LABELS[s]}
            </button>
          ))}
        </div>
        {errors.symptoms && <p className="field-error">{errors.symptoms}</p>}
      </Group>

      <Group legend="心情">
        <div role="radiogroup" aria-label="心情" className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mood === m}
              onClick={() => setMood(mood === m ? null : m)}
              className="chip"
            >
              {mood === m && <Icon name="check" size={16} />}
              {MOOD_LABELS[m]}
            </button>
          ))}
        </div>
      </Group>

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

      <FormError error={error} />

      <div className="mt-6 flex flex-col items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className="oval h-16 w-48 text-base">
          {pending ? "儲存中…" : "儲存"}
        </button>
        {existing && (
          <ConfirmDelete
            label="刪除這天的紀錄"
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
