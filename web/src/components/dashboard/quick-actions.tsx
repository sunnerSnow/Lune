"use client";

import { useRecord } from "@/components/logs/record-provider";
import { Icon } from "@/components/ui/icon";
import type { DailyLog, Period } from "@/lib/types";

/**
 * 快速紀錄：三個互相交疊的手繪橢圓（開始或結束／記錄今天／補登）。
 * 經期進行中時，「開始生理期」換成「結束生理期」。
 */
export function QuickActions({
  activePeriod,
  today,
  todayLog,
}: {
  activePeriod: Period | null;
  today: string;
  todayLog: DailyLog | null;
}) {
  const record = useRecord();
  return (
    <div className="relative mx-auto h-[150px] w-full max-w-[340px]" role="group" aria-label="快速紀錄">
      <button
        type="button"
        onClick={() =>
          activePeriod ? record.openPeriod({ kind: "end", period: activePeriod }) : record.openPeriod({ kind: "start" })
        }
        className="oval absolute top-1.5 left-0 h-[104px] w-[170px] text-[15px]"
      >
        <Icon name={activePeriod ? "stop" : "plus"} />
        {activePeriod ? "結束生理期" : "開始生理期"}
      </button>
      <button
        type="button"
        onClick={() => record.openDailyLog(today, todayLog)}
        className="oval absolute top-0 left-[152px] h-[88px] w-[140px] -rotate-[4deg] text-sm"
      >
        {todayLog ? "編輯今天" : "記錄今天"}
      </button>
      <button
        type="button"
        onClick={() => record.openBackfill()}
        className="oval absolute top-[78px] left-[218px] h-[62px] w-[100px] rotate-[6deg] text-[13px]"
      >
        補登
      </button>
    </div>
  );
}
