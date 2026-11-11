"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { setProfileArchivedAction } from "@/app/actions";
import { ProfileSheet } from "@/components/settings/profile-sheet";
import { Icon } from "@/components/ui/icon";
import { Orb } from "@/components/ui/orb";
import { useToast } from "@/components/ui/toast";
import type { Profile } from "@/lib/types";

/** Profile 清單：新增、編輯、封存／取消封存。封存的 Profile 資料保留，但不會出現在切換器 */
export function ProfileManager({ profiles, currentId }: { profiles: Profile[]; currentId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<{ key: number; profile?: Profile } | null>(null);
  const [pending, startTransition] = useTransition();
  const seq = useRef(0);
  const active = profiles.filter((p) => !p.archived);
  const archived = profiles.filter((p) => p.archived);

  const toggleArchive = (p: Profile) => {
    startTransition(async () => {
      const res = await setProfileArchivedAction(p.id, !p.archived);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(p.archived ? `已取消封存「${p.displayName}」` : `已封存「${p.displayName}」`);
      router.refresh();
    });
  };

  const row = (p: Profile) => (
    <li key={p.id} className="flex min-h-14 items-center gap-3 border-t border-line py-2">
      <Orb color={p.avatarColor ?? "rose"} size={30} glow />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm tracking-[0.1em]">{p.displayName}</span>
        <span className="block min-h-4 text-xs tracking-wider text-ink-soft">
          {[
            p.id === currentId ? "目前使用中" : p.archived ? "已封存" : null,
            p.defaultCycleLength ? `預設週期 ${p.defaultCycleLength} 天` : null,
            p.predictionEnabled ? null : "預測已關閉",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {!p.archived && (
        <button
          type="button"
          className="circle-btn"
          aria-label={`編輯「${p.displayName}」`}
          onClick={() => setEditing({ key: ++seq.current, profile: p })}
        >
          <Icon name="edit" size={18} />
        </button>
      )}
      <button
        type="button"
        className="circle-btn"
        disabled={pending}
        aria-label={p.archived ? `取消封存「${p.displayName}」` : `封存「${p.displayName}」`}
        onClick={() => toggleArchive(p)}
      >
        <Icon name="archive" size={18} />
      </button>
    </li>
  );

  return (
    <>
      <ul>{active.map(row)}</ul>
      <button
        type="button"
        onClick={() => setEditing({ key: ++seq.current })}
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-dashed border-white/70 text-sm tracking-[0.16em] hover:bg-white/8"
      >
        <Icon name="plus" size={18} />
        新增 Profile
      </button>
      {archived.length > 0 && (
        <details className="mt-5">
          <summary className="min-h-11 cursor-pointer py-2 text-xs tracking-[0.18em] text-ink-soft">
            已封存（{archived.length}）
          </summary>
          <ul>{archived.map(row)}</ul>
        </details>
      )}
      {editing && (
        <ProfileSheet key={editing.key} open onClose={() => setEditing(null)} profile={editing.profile} />
      )}
    </>
  );
}
