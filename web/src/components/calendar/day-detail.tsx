"use client";

import { useRecord } from "@/components/logs/record-provider";
import { Icon } from "@/components/ui/icon";
import { formatDate, formatDateRange, formatShortDate, inclusiveDays } from "@/lib/date/date-utils";
import { FLOW_LABELS, MOOD_LABELS, SYMPTOM_LABELS } from "@/lib/labels";
import type { DailyLog, Period } from "@/lib/types";

/** 點選日期後的詳情：當天紀錄、是否在經期中，並可直接新增／編輯 */
export function DayDetail({
  date,
  today,
  log,
  period,
  activePeriod,
  cycleDay,
  predicted,
}: {
  date: string;
  today: string;
  log: DailyLog | null;
  /** 涵蓋這天的經期 */
  period: Period | null;
  activePeriod: Period | null;
  /** 這天是週期第幾天（資料不足為 null） */
  cycleDay: number | null;
  predicted: "period" | "window" | null;
}) {
  const record = useRecord();
  const future = date > today;
  const periodDay = period ? inclusiveDays(period.startDate, date) : null;

  return (
    <section aria-labelledby="day-title" className="glass px-5 pt-4 pb-3">
      <p className="font-en text-xs tracking-[0.16em]">{date}</p>
      <h2 id="day-title" className="mt-0.5 text-base font-medium tracking-[0.1em]">
        {formatDate(date)}
      </h2>
      <p className="mt-1 text-[13px] tracking-wider text-ink-soft">
        {period
          ? `經期第 ${periodDay} 天 · ${period.endDate ? formatDateRange(period.startDate, period.endDate) : `${formatShortDate(period.startDate)} 開始，進行中`}`
          : predicted === "period"
            ? "預測經期（估算）"
            : predicted === "window"
              ? "預測可能開始（估算）"
              : cycleDay !== null && !future
                ? `週期第 ${cycleDay} 天`
                : future
                  ? "未來的日期"
                  : "—"}
      </p>
      <span className="sep-dash my-3" aria-hidden="true" />

      {log ? (
        <dl className="grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1 text-[13px] tracking-wide">
          <dt className="text-ink-soft">經血量</dt>
          <dd>{log.flow ? FLOW_LABELS[log.flow] : "—"}</dd>
          <dt className="text-ink-soft">症狀</dt>
          <dd>{log.symptoms.length ? log.symptoms.map((s) => SYMPTOM_LABELS[s]).join("、") : "—"}</dd>
          <dt className="text-ink-soft">心情</dt>
          <dd>{log.mood ? MOOD_LABELS[log.mood] : "—"}</dd>
          <dt className="text-ink-soft">備註</dt>
          <dd className="break-words whitespace-pre-line">{log.notes ?? "—"}</dd>
        </dl>
      ) : (
        <p className="text-[13px] tracking-wider text-ink-soft">
          {future ? "未來的日期還不能記錄。" : "這天沒有身體紀錄。"}
        </p>
      )}

      {!future && (
        <div className="mt-3 flex flex-col">
          <DetailAction onClick={() => record.openDailyLog(date, log)} label={log ? "編輯這天的紀錄" : "新增這天的紀錄"} />
          {period ? (
            <DetailAction onClick={() => record.openPeriod({ kind: "edit", period })} label="編輯這次經期" />
          ) : (
            <DetailAction
              onClick={() =>
                date === today && !activePeriod
                  ? record.openPeriod({ kind: "start" })
                  : record.openPeriod({ kind: "create", startDate: date })
              }
              label={date === today && !activePeriod ? "今天開始經期" : "補登：這天開始經期"}
            />
          )}
        </div>
      )}
    </section>
  );
}

function DetailAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 items-center justify-between border-t border-line text-left text-sm tracking-[0.12em]"
    >
      {label}
      <span className="circle-btn sm" aria-hidden="true">
        <Icon name="arrow" size={16} />
      </span>
    </button>
  );
}
