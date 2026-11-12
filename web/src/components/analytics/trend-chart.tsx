"use client";

import { useId, useRef, useState } from "react";
import { type TrendPoint, trendDomain } from "@/lib/cycle/analytics-series";
import { formatShortDate } from "@/lib/date/date-utils";

/**
 * 週期長度趨勢（單一系列折線）：
 * - 2px 線、半徑 4 的點＋2px 底色外框；異常間隔（未列入平均）是空心點。
 * - 參考線＝個人平均（右端標數字）；只標頭尾日期，其他交給讀數與表格。
 * - 滑過任一處：垂直細線對到最近的週期，顯示讀數；每個點也能用鍵盤聚焦。
 */
const W = 340;
const H = 190;
const PAD = { l: 30, r: 44, t: 14, b: 26 };

export function TrendChart({ points, average }: { points: TrendPoint[]; average: number | null }) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const titleId = useId();
  const lengths = points.map((p) => p.length);
  const { min, max, ticks } = trendDomain(average !== null ? [...lengths, average] : lengths);
  const x = (i: number) => (points.length === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + (i * (W - PAD.l - PAD.r)) / (points.length - 1));
  const y = (v: number) => PAD.t + ((max - v) * (H - PAD.t - PAD.b)) / (max - min);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.length).toFixed(1)}`).join(" ");

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setActive(best);
  };

  const a = active !== null ? points[active] : null;
  return (
    // 最大寬度：SVG 會等比例縮放，太寬時刻度字會被放大過頭
    <figure className="relative m-0 mx-auto max-w-[520px]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-pan-y"
        role="group"
        aria-labelledby={titleId}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setActive(null)}
      >
        {/* <title> 的內容要是單一字串（React 19 對多段子節點的 title 會出現伺服器／瀏覽器不一致） */}
        <title id={titleId}>{`週期長度趨勢，共 ${points.length} 個週期`}</title>
        {/* 格線與刻度：細、淡、實線 */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--color-chart-grid)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-soft font-en text-[11px]">
              {t}
            </text>
          </g>
        ))}
        {/* 個人平均（參考線） */}
        {average !== null && (
          <g aria-hidden="true">
            <line x1={PAD.l} x2={W - PAD.r} y1={y(average)} y2={y(average)} stroke="var(--color-chart-ref)" strokeWidth="1" />
            <text x={W - PAD.r + 6} y={y(average) + 4} className="fill-white font-en text-[11px]">
              平均 {average}
            </text>
          </g>
        )}
        {/* 準星 */}
        {a && active !== null && (
          <line x1={x(active)} x2={x(active)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-chart-ref)" strokeWidth="1" aria-hidden="true" />
        )}
        {points.length > 1 && (
          <path d={path} fill="none" stroke="var(--color-chart)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {points.map((p, i) => (
          <g
            key={p.startDate}
            tabIndex={0}
            role="img"
            aria-label={`${formatShortDate(p.startDate)} 開始，週期 ${p.length} 天${p.issue ? "，未列入平均" : ""}`}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="outline-none"
          >
            {/* 點擊範圍比點大 */}
            <circle cx={x(i)} cy={y(p.length)} r="12" fill="transparent" />
            <circle
              cx={x(i)}
              cy={y(p.length)}
              r={active === i ? 5.5 : 4}
              fill={p.issue ? "var(--color-chart-surface)" : "var(--color-chart)"}
              stroke={p.issue ? "var(--color-chart)" : "var(--color-chart-surface)"}
              strokeWidth="2"
            />
          </g>
        ))}
        {/* 只標頭尾日期 */}
        {points.length > 0 && (
          <g className="fill-ink-soft font-en text-[11px]" aria-hidden="true">
            <text x={x(0)} y={H - 8} textAnchor={points.length === 1 ? "middle" : "start"}>
              {formatShortDate(points[0].startDate)}
            </text>
            {points.length > 1 && (
              <text x={x(points.length - 1)} y={H - 8} textAnchor="end">
                {formatShortDate(points[points.length - 1].startDate)}
              </text>
            )}
          </g>
        )}
      </svg>
      {a && active !== null && (
        <div
          role="status"
          className="glass-deep pointer-events-none absolute top-1 rounded-xl px-3 py-1.5 text-xs whitespace-nowrap"
          style={{
            left: `${(x(active) / W) * 100}%`,
            transform: `translateX(${x(active) / W > 0.6 ? "-105%" : "8px"})`,
          }}
        >
          <b className="font-en text-base font-normal">{a.length}</b> 天
          <span className="ml-2 text-ink-soft">
            {formatShortDate(a.startDate)}–{formatShortDate(a.nextStartDate)}
          </span>
          {a.issue && <span className="block text-ink-soft">未列入平均（可能{a.issue === "too_short" ? "重複記錄" : "漏記"}）</span>}
        </div>
      )}
    </figure>
  );
}
