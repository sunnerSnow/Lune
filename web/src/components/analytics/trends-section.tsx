import Link from "next/link";
import type { ReactNode } from "react";
import { RankedBars } from "@/components/analytics/ranked-bars";
import { TrendChart } from "@/components/analytics/trend-chart";
import type { CountRow, RangeKey, TrendPoint } from "@/lib/cycle/analytics-series";
import { formatShortDate } from "@/lib/date/date-utils";
import { cx } from "@/lib/cx";
import { MOOD_LABELS, SYMPTOM_LABELS } from "@/lib/labels";
import type { Mood, Symptom } from "@/lib/types";

const RANGE_LABELS: Record<RangeKey, string> = { "3m": "近 3 個月", "6m": "近 6 個月", "12m": "近 1 年" };

/**
 * 趨勢與頻率：時間範圍放在所有圖表上方同一列，篩選範圍涵蓋下面每一張圖。
 * 每張圖都有表格檢視（不用滑鼠也讀得到全部數字）。
 */
export function TrendsSection({
  range,
  trend,
  average,
  symptoms,
  moods,
  loggedDays,
}: {
  range: RangeKey;
  trend: TrendPoint[];
  average: number | null;
  symptoms: CountRow<Symptom>[];
  moods: CountRow<Mood>[];
  loggedDays: number;
}) {
  return (
    <section aria-labelledby="trends-title" className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="trends-title" className="flex items-baseline gap-3">
          <span className="ttl-en text-[20px]" aria-hidden="true">
            TRENDS
          </span>
          <span className="ttl-tc">趨勢與頻率</span>
        </h2>
        <nav aria-label="時間範圍" className="flex gap-1.5">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
            <Link
              key={k}
              href={`/analytics?range=${k}`}
              scroll={false}
              aria-current={range === k ? "true" : undefined}
              className={cx(
                "flex min-h-11 items-center rounded-full border px-3.5 text-xs tracking-[0.12em]",
                range === k ? "border-white bg-white font-medium text-[#23495b]" : "border-line hover:bg-white/8",
              )}
            >
              {RANGE_LABELS[k]}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <Card title="週期長度" note="每次經期開始到下一次開始的天數；空心點是可能漏記或重複、沒有列入平均的週期">
          {trend.length < 2 ? (
            <Empty>這段期間的完整週期還不到 2 個，累積更多紀錄後即可查看趨勢。</Empty>
          ) : (
            <>
              <TrendChart points={trend} average={average} />
              <TableView
                caption="週期長度"
                head={["開始", "下一次開始", "天數", ""]}
                rows={trend.map((p) => [
                  formatShortDate(p.startDate),
                  formatShortDate(p.nextStartDate),
                  `${p.length}`,
                  p.issue ? "未列入平均" : "",
                ])}
              />
            </>
          )}
        </Card>

        <Card title="症狀出現天數" note={`這段期間共 ${loggedDays} 天有身體紀錄`}>
          {symptoms.length === 0 ? (
            <Empty>這段期間沒有記錄症狀。</Empty>
          ) : (
            <>
              <RankedBars
                label="症狀出現天數"
                totalDays={loggedDays}
                rows={symptoms.map((s) => ({ key: s.key, label: SYMPTOM_LABELS[s.key], days: s.days }))}
              />
              <TableView
                caption="症狀出現天數"
                head={["症狀", "天數", "占有紀錄的天數"]}
                rows={symptoms.map((s) => [SYMPTOM_LABELS[s.key], `${s.days}`, pct(s.days, loggedDays)])}
              />
            </>
          )}
        </Card>

        <Card title="心情" note={`這段期間共 ${loggedDays} 天有身體紀錄`}>
          {moods.length === 0 ? (
            <Empty>這段期間沒有記錄心情。</Empty>
          ) : (
            <>
              <RankedBars
                label="心情出現天數"
                totalDays={loggedDays}
                rows={moods.map((m) => ({ key: m.key, label: MOOD_LABELS[m.key], days: m.days }))}
              />
              <TableView
                caption="心情出現天數"
                head={["心情", "天數", "占有紀錄的天數"]}
                rows={moods.map((m) => [MOOD_LABELS[m.key], `${m.days}`, pct(m.days, loggedDays)])}
              />
            </>
          )}
        </Card>
      </div>
    </section>
  );
}

const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "—");

function Card({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="glass px-5 pt-4 pb-3">
      <h3 className="text-sm font-medium tracking-[0.14em]">{title}</h3>
      <p className="mt-0.5 mb-3 text-[11.5px] leading-relaxed tracking-wide text-ink-soft">{note}</p>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[13px] leading-relaxed tracking-wider text-ink-soft">{children}</p>;
}

function TableView({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <details className="mt-3 border-t border-line pt-1 text-xs">
      <summary className="flex min-h-11 cursor-pointer items-center tracking-[0.14em] text-ink-soft hover:text-white">以表格檢視</summary>
      <table className="mb-2 w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-ink-soft">
            {head.map((h, i) => (
              <th key={i} scope="col" className="py-1 pr-2 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((c, j) => (
                <td key={j} className="py-1 pr-2 font-en">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
