import type { Metadata } from "next";
import Link from "next/link";
import { CycleHero } from "@/components/dashboard/cycle-hero";
import { Notices } from "@/components/dashboard/notices";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/current-profile";
import { computeCycleSummary } from "@/lib/cycle/cycle-predictor";
import { addDays, formatShortDate } from "@/lib/date/date-utils";
import { getDb } from "@/lib/db/client";
import { FLOW_LABELS, MOOD_LABELS, SYMPTOM_LABELS } from "@/lib/labels";
import { listDailyLogs } from "@/lib/services/daily-logs";
import { listPeriods } from "@/lib/services/periods";
import { getToday } from "@/lib/today";
import type { DailyLog } from "@/lib/types";

export const metadata: Metadata = { title: "首頁" };

/** 首頁：一打開就知道目前週期狀態，並在首屏完成記錄 */
export default async function DashboardPage() {
  const user = await requireUser();
  const db = await getDb();
  const [profile, today] = await Promise.all([getCurrentProfile(user.id), getToday()]);
  const [periods, logs] = await Promise.all([
    listPeriods(db, user.id, profile.id),
    listDailyLogs(db, user.id, profile.id, addDays(today, -30), today),
  ]);
  const summary = computeCycleSummary(periods, profile, today);
  const activePeriod = periods.find((p) => p.endDate === null) ?? null;
  const lastPeriod = periods.at(-1) ?? null;
  const todayLog = logs.find((l) => l.date === today) ?? null;
  const recent = [...logs].reverse().slice(0, 3);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start lg:gap-12">
      <div className="-mx-5 lg:mx-0">
        <h1 className="sr-only">{profile.displayName} 的週期摘要</h1>
        <CycleHero summary={summary} lastPeriod={lastPeriod} color={profile.avatarColor ?? "rose"} />
      </div>

      <div className="flex flex-col gap-6 lg:pt-16">
        <QuickActions activePeriod={activePeriod} today={today} todayLog={todayLog} />
        <Notices warnings={summary.warnings} />

        <section aria-labelledby="recent-title">
          <h2 id="recent-title" className="flex items-baseline gap-2 pb-2">
            <span className="font-en text-xs tracking-[0.28em]">RECENT</span>
            <span className="text-xs tracking-[0.2em] text-ink-soft">最近紀錄</span>
          </h2>
          {recent.length === 0 ? (
            <p className="border-t border-line py-3 text-[13px] tracking-wider text-ink-soft">
              還沒有身體紀錄。按「記錄今天」，點幾下就好。
            </p>
          ) : (
            <ul>
              {recent.map((log) => (
                <li key={log.id} className="border-t border-line">
                  <Link
                    href={`/calendar?d=${log.date}`}
                    className="flex min-h-12 items-center justify-between gap-3 py-1.5 text-[13px] tracking-wider"
                  >
                    <span className="flex min-w-0 gap-4">
                      <span className="font-en w-11 flex-none">{formatShortDate(log.date)}</span>
                      <span className="truncate">{logSummary(log)}</span>
                    </span>
                    <span className="circle-btn sm" aria-hidden="true">
                      <Icon name="arrow" size={16} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-[11px] leading-relaxed tracking-wider text-ink-soft">
          預測依過去紀錄估算，不作為避孕或醫療判斷依據。若出血量、疼痛或週期變化讓你擔心，建議諮詢醫療專業人員。
        </p>
      </div>
    </div>
  );
}

function logSummary(log: DailyLog): string {
  const parts = [
    log.flow && log.flow !== "none" ? `經血量${FLOW_LABELS[log.flow]}` : null,
    ...log.symptoms.map((s) => SYMPTOM_LABELS[s]),
    log.mood ? MOOD_LABELS[log.mood] : null,
    log.notes ? "有備註" : null,
  ].filter(Boolean);
  return parts.join("・") || "已記錄";
}
