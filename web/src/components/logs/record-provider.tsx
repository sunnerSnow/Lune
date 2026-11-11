"use client";

import { createContext, type ReactNode, useContext, useMemo, useRef, useState } from "react";
import { DailyLogSheet } from "@/components/logs/daily-log-sheet";
import { type PeriodMode, PeriodSheet } from "@/components/logs/period-sheet";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { addDays } from "@/lib/date/date-utils";
import type { DailyLog } from "@/lib/types";

/**
 * 記錄用的面板集中在這裡：首頁的快速操作、日曆的當日詳情都呼叫同一組 open*。
 * 每次打開都換 key，讓表單從呼叫端給的資料重新初始化。
 */
interface RecordApi {
  openDailyLog: (date?: string, log?: DailyLog | null) => void;
  openPeriod: (mode: PeriodMode) => void;
  openBackfill: () => void;
}

const RecordContext = createContext<RecordApi | null>(null);

type Open =
  | { kind: "none" }
  | { kind: "daily"; key: number; date: string; log?: DailyLog | null }
  | { kind: "period"; key: number; mode: PeriodMode }
  | { kind: "backfill"; key: number };

export function RecordProvider({
  profileId,
  today,
  children,
}: {
  profileId: string;
  today: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<Open>({ kind: "none" });
  const seq = useRef(0);

  const api = useMemo<RecordApi>(
    () => ({
      openDailyLog: (date = today, log) => setOpen({ kind: "daily", key: ++seq.current, date, log }),
      openPeriod: (mode) => setOpen({ kind: "period", key: ++seq.current, mode }),
      openBackfill: () => setOpen({ kind: "backfill", key: ++seq.current }),
    }),
    [today],
  );
  const close = () => setOpen({ kind: "none" });

  return (
    <RecordContext.Provider value={api}>
      {children}
      {open.kind === "daily" && (
        <DailyLogSheet
          key={open.key}
          open
          onClose={close}
          profileId={profileId}
          today={today}
          initialDate={open.date}
          initialLog={open.log}
        />
      )}
      {open.kind === "period" && (
        <PeriodSheet key={open.key} open onClose={close} profileId={profileId} today={today} mode={open.mode} />
      )}
      {open.kind === "backfill" && (
        <Sheet open onClose={close} title="補登">
          <p className="text-sm tracking-wider text-ink-soft">要補登哪一種紀錄？</p>
          <div className="mt-4 grid gap-3 pb-2">
            <button
              type="button"
              className="glass flex min-h-16 items-center justify-between px-5 text-left tracking-[0.12em]"
              onClick={() => api.openPeriod({ kind: "create" })}
            >
              <span>
                補登一次經期
                <span className="mt-0.5 block text-xs tracking-wider text-ink-soft">填開始與結束日期</span>
              </span>
              <Icon name="arrow" />
            </button>
            <button
              type="button"
              className="glass flex min-h-16 items-center justify-between px-5 text-left tracking-[0.12em]"
              onClick={() => api.openDailyLog(addDays(today, -1))}
            >
              <span>
                補登某天的身體紀錄
                <span className="mt-0.5 block text-xs tracking-wider text-ink-soft">經血量、症狀、心情、備註</span>
              </span>
              <Icon name="arrow" />
            </button>
          </div>
        </Sheet>
      )}
    </RecordContext.Provider>
  );
}

export function useRecord(): RecordApi {
  const ctx = useContext(RecordContext);
  if (!ctx) throw new Error("useRecord 必須在 RecordProvider 內使用");
  return ctx;
}
