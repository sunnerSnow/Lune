import Link from "next/link";
import { Orb } from "@/components/ui/orb";
import type { CycleSummary } from "@/lib/cycle/cycle-predictor";
import { diffDays, formatDateRange, formatShortDate } from "@/lib/date/date-utils";
import type { AvatarColor, Period } from "@/lib/types";

/**
 * 首頁主視覺：一顆大光球放「週期第 N 天」，兩顆小光球（下次預測、上次經期）用細線相連。
 * 預測一律標「預測」並顯示區間；資料不足時說明原因，不給看似精確的數字。
 */
export function CycleHero({
  summary,
  lastPeriod,
  color,
}: {
  summary: CycleSummary;
  lastPeriod: Period | null;
  color: AvatarColor;
}) {
  const { status, prediction: p, today } = summary;
  const center = heroText(summary);

  return (
    <section aria-label="週期摘要" className="relative mx-auto h-[400px] w-full max-w-[360px]">
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 360 400" fill="none">
        <g stroke="rgb(255 255 255 / 0.55)" strokeWidth="1">
          <path d="M170 190 L292 116" />
          <path d="M165 250 L262 322" />
          <path d="M40 -10 L96 70" />
        </g>
      </svg>
      <div className="animate-float-slow absolute top-[42px] left-[-84px]">
        <Orb color={color} size={300} soft />
      </div>
      <Orb color="sage" size={62} glow className="animate-float absolute top-[84px] left-[268px]" />
      <Orb color="lavender" size={50} glow className="animate-float-slow absolute top-[298px] left-[240px]" />

      <div className="absolute top-[118px] left-[10px] w-[220px] text-orb-ink">
        <p className="font-en text-xs tracking-[0.32em]">{center.kicker}</p>
        <p className={center.big.length > 3 ? "font-en mt-2 text-4xl font-light" : "font-en text-[104px] leading-[0.9] font-extralight"}>
          {center.big}
        </p>
        <p className="mt-2 text-[13px] font-medium tracking-[0.18em]">{center.caption}</p>
      </div>

      {/* 下次經期（預測） */}
      <div className="absolute top-[156px] right-0 w-[150px] text-right text-xs leading-relaxed tracking-[0.08em]">
        {p && status !== "late" && (
          <>
            下次經期 <span className="tag-dashed ml-1">預測</span>
            <b className="font-en mt-0.5 block text-[22px] font-light tracking-[0.04em]">
              {formatDateRange(p.windowStart, p.windowEnd)}
            </b>
            {untilText(today, p.windowStart, p.windowEnd)}
            {p.source === "default" && <span className="block">依預設週期估算</span>}
            {p.irregular && <span className="block">週期波動較大，僅供參考</span>}
          </>
        )}
        {p && status === "late" && (
          <>
            比預測晚 <span className="tag-dashed ml-1">預測</span>
            <b className="font-en mt-0.5 block text-[22px] font-light">{summary.daysLate} 天</b>
            原本預測 {formatShortDate(p.startDate)} 左右
          </>
        )}
        {!p && summary.predictionUnavailable === "insufficient_data" && (
          <>
            下次經期
            <span className="mt-1 block">累積更多紀錄後即可預測</span>
            <Link href="/settings" className="mt-1 inline-block underline underline-offset-4">
              或先填預設週期
            </Link>
          </>
        )}
        {!p && summary.predictionUnavailable === "disabled" && <>已關閉預測</>}
        {!p && summary.predictionUnavailable === "stale" && <>補登最近一次經期，就能重新預測</>}
      </div>

      {/* 上次／這次經期 */}
      <p className="absolute top-[352px] right-0 w-[220px] text-right text-xs tracking-[0.08em]">
        {summary.activePeriod
          ? `這次從 ${formatShortDate(summary.activePeriod.startDate)} 開始`
          : lastPeriod
            ? `上次 ${lastPeriod.endDate ? formatDateRange(lastPeriod.startDate, lastPeriod.endDate) : formatShortDate(lastPeriod.startDate)}${
                lastPeriod.endDate ? ` · ${diffDays(lastPeriod.startDate, lastPeriod.endDate) + 1} 天` : ""
              }`
            : "還沒有經期紀錄"}
      </p>
    </section>
  );
}

function heroText(s: CycleSummary): { kicker: string; big: string; caption: string } {
  if (s.status === "in_period" && s.activePeriod) {
    return { kicker: "PERIOD DAY", big: String(s.activePeriod.day), caption: `經期第 ${s.activePeriod.day} 天` };
  }
  if ((s.status === "waiting" || s.status === "late") && s.cycleDay !== null) {
    return { kicker: "CYCLE DAY", big: String(s.cycleDay), caption: `週期第 ${s.cycleDay} 天` };
  }
  if (s.status === "stale") {
    return { kicker: "WELCOME BACK", big: "—", caption: "距離上次紀錄超過 90 天" };
  }
  return { kicker: "HELLO", big: "Luné", caption: "記錄第一次經期後，就能看到週期" };
}

function untilText(today: string, start: string, end: string): string {
  const a = diffDays(today, start);
  const b = diffDays(today, end);
  if (a > 0) return a === b ? `${a} 天後` : `${a}–${b} 天後`;
  if (b >= 0) return "可能在這幾天開始";
  return "";
}
