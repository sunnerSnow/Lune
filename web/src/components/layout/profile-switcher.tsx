"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { switchProfileAction } from "@/app/actions";
import { Icon } from "@/components/ui/icon";
import { Orb } from "@/components/ui/orb";
import { useToast } from "@/components/ui/toast";
import type { Profile } from "@/lib/types";

/** 頂部的 Profile 切換器：玻璃膠囊＋下拉清單。切換只是 UI 偏好，伺服器每次都會驗證歸屬 */
export function ProfileSwitcher({ current, profiles }: { current: Profile; profiles: Profile[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (p: Profile) => {
    setOpen(false);
    if (p.id === current.id) return;
    startTransition(async () => {
      const res = await switchProfileAction(p.id);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="glass-deep flex min-h-11 items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-sm tracking-[0.1em]"
      >
        <Orb color={current.avatarColor ?? "rose"} size={26} glow />
        <span className="max-w-[9em] truncate">{current.displayName}</span>
        <span className="sr-only">（切換 Profile）</span>
        <Icon name="down" size={16} className={pending ? "animate-pulse" : undefined} />
      </button>
      {open && (
        <div
          id={menuId}
          className="glass-deep animate-rise absolute right-0 z-50 mt-2 w-60 rounded-[24px] p-2"
          style={{ background: "rgb(55 98 120 / 0.92)" }}
        >
          <p className="px-3 pt-2 pb-1 text-[11px] tracking-[0.22em] text-ink-soft">切換 Profile</p>
          <ul className="flex flex-col">
            {profiles.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p)}
                  aria-current={p.id === current.id ? "true" : undefined}
                  className="flex min-h-11 w-full items-center gap-3 rounded-full px-3 text-left text-sm tracking-[0.1em] hover:bg-white/10"
                >
                  <Orb color={p.avatarColor ?? "rose"} size={22} glow />
                  <span className="flex-1 truncate">{p.displayName}</span>
                  {p.id === current.id && <Icon name="check" size={16} />}
                </button>
              </li>
            ))}
          </ul>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="mt-1 flex min-h-11 items-center gap-2 rounded-full border-t border-white/20 px-3 text-xs tracking-[0.16em] text-ink-soft hover:text-white"
          >
            <Icon name="settings" size={16} />
            管理 Profile
          </Link>
        </div>
      )}
    </div>
  );
}
