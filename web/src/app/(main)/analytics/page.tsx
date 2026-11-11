import type { Metadata } from "next";
import { type ConstellationItem, Constellation } from "@/components/analytics/constellation";
import { warningText } from "@/components/dashboard/notices";
import { PageTitle } from "@/components/ui/page-title";
import { requireUser } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/current-profile";
import { computeAnalytics, MAX_VALID_CYCLE, MIN_VALID_CYCLE } from "@/lib/cycle/cycle-calculator";
import { computeCycleSummary } from "@/lib/cycle/cycle-predictor";
import { diffDays, formatShortDate, inclusiveDays } from "@/lib/date/date-utils";
import { getDb } from "@/lib/db/client";
import { listPeriods } from "@/lib/services/periods";
import { getToday } from "@/lib/today";

export const metadata: Metadata = { title: "週期分析" };

const SHOWN = 6;

/** 週期分析：只用個人資料；資料不足就說明，不用不可靠的資料產生看似精確的結論 */
export default async function AnalyticsPage() {
  const user = await requireUser();
  const db = await getDb();
  const [profile, today] = await Promise.all([getCurrentProfile(user.id), getToday()]);
  const periods = await listPeriods(db, user.id, profile.id);
  const analytics = computeAnalytics(periods);
  const summary = computeCycleSummary(periods, profile, today);

  const newestFirst = [...periods].reverse().slice(0, SHOWN);
  const items: ConstellationItem[] = [];
  if (summary.prediction && newestFirst.length > 0) {
    items.push({
      key: "predicted",
      date: summary.prediction.startDate,
      length: null,
      kind: "predicted",
      gapToOlder: summary.prediction.cycleLength,
      gapIssue: false,
    });
  }
  newestFirst.forEach((p, i) => {
    const older = newestFirst[i + 1];
    const gap = older ? diffDays(older.startDate, p.startDate) : null;
    items.push({
      key: p.id,
      date: p.startDate,
      length: p.endDate ? inclusiveDays(p.startDate, p.endDate) : null,
      kind: p.endDate ? "done" : "ongoing",
      gapToOlder: gap,
      gapIssue: gap !== null && (gap < MIN_VALID_CYCLE || gap > MAX_VALID_CYCLE),
    });
  });
  // 星座的連線標在較新那顆上，最後一顆不畫往下的連線
  const recentValid = analytics.recentCycles.filter((c) => c.issue === null).map((c) => c.length);
  const spread = recentValid.length >= 2 ? Math.max(...recentValid) - Math.min(...recentValid) : null;
  const intervalWarnings = summary.warnings.filter((w) => w.kind === "interval_too_short" || w.kind === "interval_too_long");

  return (
    <div>
      <PageTitle en="INSIGHTS" tc="週期分析" />

      <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div>
          <dl className="glass grid grid-cols-3 px-1 py-4 text-center">
            <Stat label="已記錄週期" value={analytics.cycleCount} unit="次" />
            <Stat label="平均週期" value={analytics.averageCycleLength} unit="天" divider />
            <Stat label="平均經期" value={analytics.averagePeriodLength} unit="天" divider />
          </dl>
          {analytics.averageCycleLength === null && (
            <p className="mt-3 text-[13px] leading-relaxed tracking-wider text-ink-soft">
              累積更多紀錄後即可查看：至少要有 3 次經期（2 個完整週期）才會計算平均週期。
            </p>
          )}
          {spread !== null && (
            <p className="mt-3 text-[13px] tracking-wider">
              最近 {recentValid.length} 次週期最長和最短相差 {spread} 天
              {analytics.irregular ? "，波動較大，預測僅供參考。" : "，算是規律。"}
            </p>
          )}
          {intervalWarnings.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-xs leading-relaxed tracking-wide text-ink-soft">
              {intervalWarnings.map((w, i) => (
                <li key={i}>＊{warningText(w)}</li>
              ))}
            </ul>
          )}
          <p className="mt-6 hidden text-[11px] leading-relaxed tracking-wider text-ink-soft lg:block">
            分析只整理你的紀錄，不提供診斷。若出血量、疼痛或週期變化讓你擔心，建議諮詢醫療專業人員；
            嚴重疼痛、大量出血或暈眩時請立即就醫。
          </p>
        </div>

        <section aria-labelledby="recent-periods" className="mt-8 lg:mt-0">
          <h2 id="recent-periods" className="flex items-baseline justify-between pb-3 text-xs tracking-[0.18em] text-ink-soft">
            <span>最近的經期</span>
            {periods.length > 0 && <span>共 {periods.length} 次紀錄</span>}
          </h2>
          {items.length === 0 ? (
            <p className="glass px-5 py-6 text-center text-[13px] tracking-wider">
              還沒有經期紀錄。記錄或補登之後，這裡會畫出你的週期星座。
            </p>
          ) : (
            <>
              <Constellation items={items} />
              <ul className="sr-only">
                {items.map((it) => (
                  <li key={it.key}>
                    {it.kind === "predicted"
                      ? `預測下一次 ${formatShortDate(it.date)} 左右`
                      : `${formatShortDate(it.date)} 開始，${it.length ? `${it.length} 天` : "進行中"}`}
                    {it.gapToOlder !== null ? `，與前一次相隔 ${it.gapToOlder} 天` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <p className="mt-8 text-[11px] leading-relaxed tracking-wider text-ink-soft lg:hidden">
        分析只整理你的紀錄，不提供診斷。若出血量、疼痛或週期變化讓你擔心，建議諮詢醫療專業人員；嚴重疼痛、大量出血或暈眩時請立即就醫。
      </p>
    </div>
  );
}

function Stat({ label, value, unit, divider }: { label: string; value: number | null; unit: string; divider?: boolean }) {
  return (
    <div className={divider ? "relative before:absolute before:inset-y-[10%] before:left-0 before:border-l before:border-line" : undefined}>
      <dt className="sr-only">{label}</dt>
      <dd className="font-en text-[40px] leading-tight font-extralight">
        {value ?? "—"}
        {value !== null && <small className="ml-0.5 font-tc text-xs font-medium tracking-[0.1em]">{unit}</small>}
      </dd>
      <dd aria-hidden="true" className="text-[11.5px] tracking-[0.14em] text-ink-soft">
        {label}
      </dd>
    </div>
  );
}
