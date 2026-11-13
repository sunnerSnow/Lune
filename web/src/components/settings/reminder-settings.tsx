"use client";

import { useEffect, useState, useTransition } from "react";
import {
  pushDeviceStatusAction,
  removePushSubscriptionAction,
  savePushSubscriptionAction,
  sendTestPushAction,
  updateReminderSettingsAction,
} from "@/app/actions";
import { Icon } from "@/components/ui/icon";

type DeviceState = "checking" | "ios" | "unsupported" | "denied" | "off" | "on";
type Message = { ok: boolean; text: string } | null;

/** VAPID 公鑰（URL-safe base64）→ pushManager.subscribe 要的 bytes */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const view = new Uint8Array(a);
  return view.every((v, i) => v === b[i]);
}

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

const DEVICE_NOTE: Partial<Record<DeviceState, string>> = {
  checking: "確認中…",
  ios: "iPhone／iPad 要先在 Safari 按「分享 → 加入主畫面」，再從主畫面打開 Luné，才能開啟通知（iOS 16.4 以上）。",
  unsupported: "這個瀏覽器不支援通知，可以換成 Chrome、Edge、Firefox 或 Safari。",
  denied: "通知被封鎖了。要到瀏覽器或手機的設定裡，允許 Luné 傳送通知。",
  off: "開啟後，每天早上 9 點左右會在這台裝置收到提醒。",
};

/** 這台裝置的通知：開啟／關閉／測試。訂閱跟著帳號，同一個帳號可以在好幾台裝置開啟 */
function DevicePush({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<DeviceState>("checking");
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<DeviceState> => {
      if (!pushSupported()) {
        const standalone = window.matchMedia("(display-mode: standalone)").matches;
        return isIos() && !standalone ? "ios" : "unsupported";
      }
      if (Notification.permission === "denied") return "denied";
      const sub = await currentSubscription();
      if (!sub) return "off";
      // 這台裝置訂閱過，但可能是別的帳號訂的
      const res = await pushDeviceStatusAction(sub.endpoint);
      return res.ok && res.value ? "on" : "off";
    })()
      .catch((): DeviceState => "off")
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const key = keyBytes(publicKey);
        let sub = await reg.pushManager.getSubscription();
        // 伺服器換過金鑰的話，舊的訂閱收不到，要重新訂閱
        if (sub && !sameKey(sub.options.applicationServerKey, key)) {
          await sub.unsubscribe();
          sub = null;
        }
        sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        const res = await savePushSubscriptionAction(sub.toJSON());
        if (!res.ok) {
          setMessage({ ok: false, text: res.error.message });
          return;
        }
        setState("on");
        setMessage({ ok: true, text: "已開啟。可以按「測試」確認收得到。" });
      } catch {
        setMessage({ ok: false, text: "開啟失敗，請稍後再試" });
      }
    });

  const disable = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        const sub = await currentSubscription();
        if (sub) {
          await removePushSubscriptionAction(sub.endpoint);
          await sub.unsubscribe();
        }
        setState("off");
        setMessage({ ok: true, text: "已關閉這台裝置的通知。" });
      } catch {
        setMessage({ ok: false, text: "關閉失敗，請稍後再試" });
      }
    });

  const test = () =>
    startTransition(async () => {
      setMessage(null);
      const sub = await currentSubscription().catch(() => null);
      if (!sub) {
        setState("off");
        return;
      }
      const res = await sendTestPushAction(sub.endpoint);
      if (res.ok) setMessage({ ok: true, text: "測試通知已送出，幾秒內會出現。" });
      else {
        if (res.error.code === "subscription_gone" || res.error.code === "not_subscribed") setState("off");
        setMessage({ ok: false, text: res.error.message });
      }
    });

  return (
    <div className="border-t border-line py-3">
      <div className="flex min-h-12 items-center justify-between gap-3">
        <p className="text-sm tracking-[0.14em]">
          這台裝置的通知
          <span className="mt-0.5 block text-xs tracking-wider text-ink-soft">
            {state === "on" ? "已開啟" : state === "checking" ? "確認中…" : "未開啟"}
          </span>
        </p>
        {state === "off" && (
          <button type="button" onClick={enable} disabled={pending} className="chip solid">
            {pending ? "開啟中…" : "開啟"}
          </button>
        )}
        {state === "on" && (
          <span className="flex flex-none gap-2">
            <button type="button" onClick={test} disabled={pending} className="chip">
              測試
            </button>
            <button type="button" onClick={disable} disabled={pending} className="chip">
              關閉
            </button>
          </span>
        )}
      </div>
      {state !== "on" && state !== "checking" && DEVICE_NOTE[state] && (
        <p className="text-xs leading-relaxed tracking-wide text-ink-soft">{DEVICE_NOTE[state]}</p>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "mt-1 text-xs tracking-wide" : "field-error"}>
          {!message.ok && <Icon name="info" size={14} />}
          {message.text}
        </p>
      )}
    </div>
  );
}

const BEFORE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "不提醒" },
  { value: 1, label: "前 1 天" },
  { value: 2, label: "前 2 天" },
  { value: 3, label: "前 3 天" },
];

/** 目前 Profile 的提醒設定（每個 Profile 各自設定；改了立刻存） */
function ProfileReminders({
  profileId,
  profileName,
  remindBeforeDays,
  remindInactive,
  predictionEnabled,
}: {
  profileId: string;
  profileName: string;
  remindBeforeDays: number | null;
  remindInactive: boolean;
  predictionEnabled: boolean;
}) {
  const [settings, setSettings] = useState({ remindBeforeDays, remindInactive });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (next: typeof settings) => {
    const previous = settings;
    setSettings(next);
    setError(null);
    startTransition(async () => {
      const res = await updateReminderSettingsAction(profileId, next);
      if (!res.ok) {
        setSettings(previous);
        setError(res.error.message);
      }
    });
  };

  return (
    <div className="border-t border-line pt-3">
      <p className="text-xs tracking-[0.14em] text-ink-soft">「{profileName}」的提醒</p>
      <fieldset className="mt-2 border-0 p-0">
        <legend className="text-sm tracking-[0.14em]">
          預測快到了
          <span className="mt-0.5 block text-xs tracking-wider text-ink-soft">
            {predictionEnabled
              ? "預測區間開始前幾天提醒，一個週期一次"
              : "這個 Profile 關閉了預測，要先在 Profile 設定裡打開，才會有這個提醒"}
          </span>
        </legend>
        <div role="radiogroup" aria-label="預測快到了" className="mt-2 flex flex-wrap gap-2">
          {BEFORE_OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={settings.remindBeforeDays === o.value}
              disabled={pending}
              onClick={() => save({ ...settings, remindBeforeDays: o.value })}
              className="chip"
            >
              {settings.remindBeforeDays === o.value && <Icon name="check" size={16} />}
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
      <button
        type="button"
        role="switch"
        aria-checked={settings.remindInactive}
        disabled={pending}
        onClick={() => save({ ...settings, remindInactive: !settings.remindInactive })}
        className="mt-3 flex min-h-12 w-full items-center justify-between border-t border-line pt-2 text-left text-sm tracking-[0.12em]"
      >
        <span>
          很久沒記錄時提醒
          <span className="mt-0.5 block text-xs tracking-wider text-ink-soft">
            超過 35 天沒有新增或修改紀錄時提醒一次
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`relative h-7 w-12 flex-none rounded-full border border-white/70 transition-colors ${settings.remindInactive ? "bg-white" : "bg-transparent"}`}
        >
          <span
            className={`absolute top-1/2 size-5 -translate-y-1/2 rounded-full transition-all ${settings.remindInactive ? "left-6 bg-sky-deep" : "left-1 bg-white"}`}
          />
        </span>
      </button>
      {error && (
        <p role="alert" className="field-error">
          <Icon name="info" size={14} />
          {error}
        </p>
      )}
    </div>
  );
}

export function ReminderSettings({
  publicKey,
  profile,
}: {
  publicKey: string;
  profile: {
    id: string;
    displayName: string;
    remindBeforeDays: number | null;
    remindInactive: boolean;
    predictionEnabled: boolean;
  };
}) {
  return (
    <>
      <DevicePush publicKey={publicKey} />
      <ProfileReminders
        key={profile.id}
        profileId={profile.id}
        profileName={profile.displayName}
        remindBeforeDays={profile.remindBeforeDays}
        remindInactive={profile.remindInactive}
        predictionEnabled={profile.predictionEnabled}
      />
      <p className="mt-3 text-xs leading-relaxed tracking-wide text-ink-soft">
        通知只會顯示「Luné」和一句中性的提醒，不會出現經期、症狀或 Profile
        名稱。登出不會關掉這台裝置的通知，要停止請按「關閉」。
      </p>
    </>
  );
}
