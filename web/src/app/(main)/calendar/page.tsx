import type { Metadata } from "next";
import Link from "next/link";
import { CalendarLegend, CycleCalendar } from "@/components/calendar/cycle-calendar";
import { DayDetail } from "@/components/calendar/day-detail";
import { Icon } from "@/components/ui/icon";
import { Orb } from "@/components/ui/orb";
import { PageTitle } from "@/components/ui/page-title";
import { requireUser } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/current-profile";
import { monthMarks } from "@/lib/cycle/calendar-marks";
import { MAX_CYCLE_DAY, computeCycleSummary } from "@/lib/cycle/cycle-predictor";
import { addMonths, diffDays, isIsoDate, isYearMonth, monthGrid, yearMonthOf } from "@/lib/date/date-utils";
import { getDb } from "@/lib/db/client";
import { listDailyLogs } from "@/lib/services/daily-logs";
import { listPeriods } from "@/lib/services/periods";
import { getToday } from "@/lib/today";

export const metadata: Metadata = { title: "日曆" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** 生理日曆：網址只帶月份與日期（?m=YYYY-MM&d=YYYY-MM-DD），不放任何健康內容 */
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [profile, today] = await Promise.all([getCurrentProfile(user.id), getToday()]);

  const d = first(sp.d);
  const m = first(sp.m);
  const pickedDate = isIsoDate(d) ? d : null;
  const ym = isYearMonth(m) ? m : yearMonthOf(pickedDate ?? today);
  const selected =
    pickedDate && yearMonthOf(pickedDate) === ym ? pickedDate : yearMonthOf(today) === ym ? today : `${ym}-01`;

  const periods = await listPeriods(db, user.id, profile.id);
  const summary = computeCycleSummary(periods, profile, today);
  const grid = monthGrid(ym);
  const gridStart = grid[0][0].date;
  const gridEnd = grid[grid.length - 1][6].date;
  const logs = await listDailyLogs(db, user.id, profile.id, gridStart, gridEnd);
  const weeks = monthMarks(ym, {
    periods,
    logDates: logs.map((l) => l.date),
    prediction: summary.prediction,
    today,
  });

  const mark = weeks.flat().find((x) => x.date === selected);
  const selectedLog = logs.find((l) => l.date === selected) ?? null;
  const selectedPeriod =
    periods.find((p) => p.startDate <= selected && selected <= (p.endDate ?? today)) ?? null;
  const activePeriod = periods.find((p) => p.endDate === null) ?? null;
  const lastStartBefore = [...periods].reverse().find((p) => p.startDate <= selected)?.startDate ?? null;
  const dayInCycle = lastStartBefore ? diffDays(lastStartBefore, selected) + 1 : null;
  const cycleDay = dayInCycle !== null && dayInCycle <= MAX_CYCLE_DAY ? dayInCycle : null;
  const [y, mo] = ym.split("-");

  return (
    <div className="relative">
      <Orb
        color="sage"
        size={150}
        soft
        className="animate-float-slow pointer-events-none absolute -top-24 -right-20 opacity-20 blur-[4px]"
      />
      <PageTitle en="CALENDAR" tc="生理日曆" />

      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10">
        <div>
          <div className="flex items-center justify-between">
            <Link href={`/calendar?m=${addMonths(ym, -1)}`} scroll={false} className="circle-btn" aria-label="上一個月">
              <Icon name="left" />
            </Link>
            <h2 className="font-en text-[22px] font-light tracking-[0.2em]" aria-live="polite">
              {y} . {mo}
              <span className="sr-only">月</span>
            </h2>
            <Link
              href="/calendar"
              scroll={false}
              className="flex min-h-11 items-center rounded-full border border-line px-4 text-xs tracking-[0.14em]"
            >
              今天
            </Link>
            <Link href={`/calendar?m=${addMonths(ym, 1)}`} scroll={false} className="circle-btn" aria-label="下一個月">
              <Icon name="right" />
            </Link>
          </div>

          <div className="mt-4">
            <CycleCalendar weeks={weeks} ym={ym} selected={selected} today={today} prediction={summary.prediction} />
          </div>
          <div className="mt-3">
            <CalendarLegend />
          </div>
          {summary.prediction && (
            <p className="mt-2 text-[11px] tracking-wider text-ink-soft">
              預測只標下一次，依過去紀錄估算，不作為避孕或醫療判斷依據。
            </p>
          )}
        </div>

        <div className="mt-5 lg:mt-0">
          <DayDetail
            date={selected}
            today={today}
            log={selectedLog}
            period={selectedPeriod}
            activePeriod={activePeriod}
            cycleDay={cycleDay}
            predicted={mark?.predictedPeriod ? "period" : mark?.predictedWindow ? "window" : null}
          />
        </div>
      </div>
    </div>
  );
}
