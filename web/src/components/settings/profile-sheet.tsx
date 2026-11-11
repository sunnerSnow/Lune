"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type ActionError, createProfileAction, updateProfileAction } from "@/app/actions";
import { Field, fieldErrors, FormError, Group } from "@/components/logs/form-bits";
import { Icon } from "@/components/ui/icon";
import { Orb } from "@/components/ui/orb";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { AVATAR_COLOR_LABELS } from "@/lib/labels";
import { AVATAR_COLORS, type AvatarColor, type Profile } from "@/lib/types";

/** 新增／編輯 Profile：只有名稱必填；預設週期與經期天數選填（資料不足時才會用到） */
export function ProfileSheet({ open, onClose, profile }: { open: boolean; onClose: () => void; profile?: Profile }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(profile?.displayName ?? "");
  const [color, setColor] = useState<AvatarColor>(profile?.avatarColor ?? "rose");
  const [cycle, setCycle] = useState(profile?.defaultCycleLength?.toString() ?? "");
  const [period, setPeriod] = useState(profile?.defaultPeriodLength?.toString() ?? "");
  const [prediction, setPrediction] = useState(profile?.predictionEnabled ?? true);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = fieldErrors(error);

  const toNumber = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = () => {
    setError(null);
    const input = {
      displayName: name,
      avatarColor: color,
      defaultCycleLength: toNumber(cycle),
      defaultPeriodLength: toNumber(period),
      predictionEnabled: prediction,
    };
    startTransition(async () => {
      const res = profile ? await updateProfileAction(profile.id, input) : await createProfileAction(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(profile ? "已儲存" : `已新增「${res.value.displayName}」`);
      router.refresh();
      onClose();
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title={profile ? "編輯 Profile" : "新增 Profile"}>
      <Field label="顯示名稱" error={errors.displayName}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="field-input"
            value={name}
            maxLength={30}
            required
            autoComplete="off"
            placeholder="例如：我、媽媽、妹妹"
            aria-describedby={describedBy}
            aria-invalid={invalid}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>

      <Group legend="代表色">
        <div role="radiogroup" aria-label="代表色" className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={AVATAR_COLOR_LABELS[c]}
              onClick={() => setColor(c)}
              className={`grid size-12 place-items-center rounded-full border-[1.5px] ${color === c ? "border-white shadow-[0_0_10px_rgb(255_255_255/0.55)]" : "border-transparent"}`}
            >
              <Orb color={c} size={34} glow />
            </button>
          ))}
        </div>
      </Group>

      <div className="grid grid-cols-2 gap-4">
        <Field label="預設週期（天）" error={errors.defaultCycleLength} hint="選填，15–90">
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={15}
              max={90}
              className="field-input font-en"
              value={cycle}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => setCycle(e.target.value)}
            />
          )}
        </Field>
        <Field label="預設經期（天）" error={errors.defaultPeriodLength} hint="選填，1–14">
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={14}
              className="field-input font-en"
              value={period}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => setPeriod(e.target.value)}
            />
          )}
        </Field>
      </div>
      <p className="mt-2 text-xs leading-relaxed tracking-wide text-ink-soft">
        紀錄還不夠時，預測會先用這裡的天數；累積 2 個以上完整週期後，改用你的實際平均。
      </p>

      <button
        type="button"
        role="switch"
        aria-checked={prediction}
        onClick={() => setPrediction((v) => !v)}
        className="mt-5 flex min-h-12 w-full items-center justify-between border-t border-line pt-2 text-left text-sm tracking-[0.12em]"
      >
        <span>
          顯示下次經期預測
          <span className="mt-0.5 block text-xs tracking-wider text-ink-soft">關閉後首頁與日曆不顯示預測</span>
        </span>
        <span
          aria-hidden="true"
          className={`relative h-7 w-12 flex-none rounded-full border border-white/70 transition-colors ${prediction ? "bg-white" : "bg-transparent"}`}
        >
          <span
            className={`absolute top-1/2 size-5 -translate-y-1/2 rounded-full transition-all ${prediction ? "left-6 bg-sky-deep" : "left-1 bg-white"}`}
          />
        </span>
      </button>

      <FormError error={error} />

      <div className="mt-6 flex justify-center">
        <button type="button" onClick={submit} disabled={pending} className="oval h-16 w-48 text-base">
          {pending ? "儲存中…" : profile ? "儲存" : (
            <>
              <Icon name="plus" />
              新增
            </>
          )}
        </button>
      </div>
    </Sheet>
  );
}
