"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";

/**
 * 玻璃底部面板（原生 <dialog>：自帶焦點鎖定、Esc 關閉、背景不可操作）。
 * 手機貼底、桌面置中。關閉一律經過 onClose，由呼叫端決定是否真的關。
 */
export function Sheet({
  open,
  onClose,
  title,
  aside,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 標題右側（例如日期選擇） */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="sheet m-0 w-full max-w-none bg-transparent p-0 text-white open:animate-rise fixed inset-x-0 bottom-0 top-auto max-h-[92dvh] sm:inset-0 sm:m-auto sm:max-h-[86dvh] sm:max-w-lg"
    >
      <div
        className="glass-deep flex max-h-[92dvh] flex-col rounded-t-[var(--radius-sheet)] border-b-0 sm:max-h-[86dvh] sm:rounded-[var(--radius-sheet)] sm:border-b"
        // 面板底色要夠深：白字（含 88% 的次要字）在上面要有 4.5:1 以上
        style={{ background: "rgb(58 104 128 / 0.92)" }}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/60 sm:hidden" aria-hidden="true" />
        <div className="flex items-center gap-3 px-5 pt-3 pb-1 sm:pt-5">
          <h2 className="flex-1 text-lg font-medium tracking-[0.14em]">{title}</h2>
          {aside}
          <button type="button" onClick={onClose} className="circle-btn sm" aria-label="關閉">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </dialog>
  );
}
