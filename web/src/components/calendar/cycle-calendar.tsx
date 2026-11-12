import Link from "next/link";
import { Orb } from "@/components/ui/orb";
import type { DayMarks } from "@/lib/cycle/calendar-marks";
import type { Prediction } from "@/lib/cycle/cycle-predictor";
import { WEEKDAY_LABELS } from "@/lib/date/date-utils";
import { cx } from "@/lib/cx";

/**
 * 月曆：實際經期＝實心光球、預測經期＝虛線圈、可能開始＝點狀底線、今天＝白色細圈、有紀錄＝小圓點。
 * 同一次經期（或預測經期）的相鄰日子用細線串起來；狀態都寫進 aria-label，不只靠顏色。
 */
export function CycleCalendar({
  weeks,
  ym,
  selected,
  today,
  prediction,
}: {
  weeks: DayMarks[][];
  ym: string;
  selected: string;
  today: string;
  prediction: Prediction | null;
}) {
  const flat = weeks.flat();
  const kindOf = (m: DayMarks | undefined) =>
    !m ? null : m.period ? `p:${m.period.periodId}` : m.predictedPeriod ? "pred" : null;

  // 第一格與最後一格：用經期位置／預測範圍判斷是否延續到月曆外
  const continuesLeft = (m: DayMarks) =>
    m.period
      ? m.period.position === "middle" || m.period.position === "end"
      : m.predictedPeriod && prediction !== null && m.date > prediction.startDate;
  const continuesRight = (m: DayMarks) =>
    m.period
      ? (m.period.position === "start" || m.period.position === "middle") && m.date < today
      : m.predictedPeriod && prediction?.endDate != null && m.date < prediction.endDate;

  return (
    <div className="relative">
      <div className="grid grid-cols-7 pb-1.5 text-center text-[11px] tracking-[0.1em] text-ink-soft" aria-hidden="true">
        {WEEKDAY_LABELS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div role="grid" aria-label="月曆" className="flex flex-col gap-1">
        {weeks.map((week, wi) => (
          <div role="row" key={wi} className="grid grid-cols-7">
            {week.map((m, di) => {
              const k = wi * 7 + di;
              const kind = kindOf(m);
              const left = kind !== null && (k === 0 ? continuesLeft(m) : kindOf(flat[k - 1]) === kind);
              const right = kind !== null && (k === flat.length - 1 ? continuesRight(m) : kindOf(flat[k + 1]) === kind);
              return (
                <div role="gridcell" key={m.date} className="relative">
                  {left && <Thread side="left" dashed={!m.period} edge={di === 0} />}
                  {right && <Thread side="right" dashed={!m.period} edge={di === 6} />}
                  <DayCell m={m} ym={ym} selected={m.date === selected} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Thread({ side, dashed, edge }: { side: "left" | "right"; dashed: boolean; edge: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "pointer-events-none absolute top-[21px] z-0 border-t border-white/70",
        dashed && "border-dashed",
        // 線只畫在圓圈之間（圓半徑 18px），不穿過圓圈裡的數字
        side === "left"
          ? edge
            ? "-left-3 right-[calc(50%+18px)]"
            : "left-0 right-[calc(50%+18px)]"
          : edge
            ? "left-[calc(50%+18px)] -right-3"
            : "left-[calc(50%+18px)] right-0",
      )}
    />
  );
}

function DayCell({ m, ym, selected }: { m: DayMarks; ym: string; selected: boolean }) {
  const day = Number(m.date.slice(8));
  const label = [
    `${Number(m.date.slice(5, 7))} 月 ${day} 日`,
    m.isToday ? "今天" : null,
    m.period ? (m.period.ongoing ? "經期中" : "經期") : null,
    m.predictedPeriod ? "預測經期" : m.predictedWindow ? "預測可能開始" : null,
    m.hasLog ? "有紀錄" : null,
    selected ? "已選取" : null,
  ]
    .filter(Boolean)
    .join("，");
  const target = m.inMonth ? ym : m.date.slice(0, 7);
  return (
    <Link
      href={`/calendar?m=${target}&d=${m.date}`}
      scroll={false}
      aria-label={label}
      aria-current={m.isToday ? "date" : undefined}
      className={cx(
        "relative z-[1] mx-auto grid h-11 w-full max-w-12 place-items-center rounded-2xl transition-colors",
        selected ? "bg-white/16" : "hover:bg-white/8",
      )}
    >
      {m.period && <Orb color="rose" glow className="absolute top-[3px] size-9" />}
      {!m.period && m.predictedPeriod && <span aria-hidden="true" className="orb orb-predicted absolute top-[3px] size-9" />}
      {m.isToday && (
        <span
          aria-hidden="true"
          className="absolute top-[3px] size-9 rounded-full border-[1.5px] border-white shadow-[0_0_10px_rgb(255_255_255/0.6)]"
        />
      )}
      {/* 非本月的日子：字小一號、字重較細來區分，不用變淡（變淡會讓白字對比掉到 3:1） */}
      <span
        className={cx(
          "font-en relative",
          m.inMonth ? "text-[15px]" : "text-[12.5px] font-light",
          m.period && "font-medium text-orb-ink",
          !m.period && !m.predictedPeriod && m.predictedWindow && "underline decoration-dotted decoration-2 underline-offset-[5px]",
        )}
      >
        {day}
      </span>
      {m.hasLog && <span aria-hidden="true" className="absolute bottom-0 size-1 rounded-full bg-white" />}
    </Link>
  );
}

export function CalendarLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[11.5px] tracking-[0.06em]" aria-label="圖例">
      <li className="inline-flex items-center gap-1.5">
        <Orb color="rose" size={14} />
        經期
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="orb orb-predicted size-3.5" aria-hidden="true" />
        預測經期
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="font-en underline decoration-dotted decoration-2 underline-offset-4" aria-hidden="true">
          8
        </span>
        可能開始
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="size-3.5 rounded-full border-[1.5px] border-white" aria-hidden="true" />
        今天
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-white" aria-hidden="true" />
        有紀錄
      </li>
    </ul>
  );
}
