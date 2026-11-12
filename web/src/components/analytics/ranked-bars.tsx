"use client";

import { useState } from "react";

/**
 * 依多寡排序的橫條（單一色相）：
 * - 長條 ≤ 24px（這裡 12px），數值端 4px 圓角、基線端方角，從同一條基線長出來。
 * - 每條的天數標在條尾（文字用文字色）；滑過或聚焦時亮一點，顯示占記錄天數的比例。
 */
export function RankedBars({
  rows,
  totalDays,
  label,
}: {
  rows: { key: string; label: string; days: number }[];
  /** 範圍內有紀錄的天數（算比例用） */
  totalDays: number;
  label: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.days));
  return (
    <ul aria-label={label} className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const pct = totalDays > 0 ? Math.round((r.days / totalDays) * 100) : 0;
        const on = active === r.key;
        return (
          <li
            key={r.key}
            tabIndex={0}
            aria-label={`${r.label}：${r.days} 天，占有紀錄的 ${pct}%`}
            onPointerEnter={() => setActive(r.key)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(r.key)}
            onBlur={() => setActive(null)}
            className="grid grid-cols-[4.5rem_1fr] items-center gap-3 rounded-lg outline-offset-2"
          >
            <span className="truncate text-[13px] tracking-wider" aria-hidden="true">
              {r.label}
            </span>
            <span className="relative flex items-center gap-2" aria-hidden="true">
              <span
                className="block h-3 rounded-r-[4px] transition-[filter] duration-150"
                style={{
                  // 條尾要留位置給天數，所以最長的條是「容器寬 − 4.5rem」，其他照比例
                  width: `max(4px, calc((100% - 4.5rem) * ${(r.days / max).toFixed(4)}))`,
                  background: "var(--color-chart)",
                  filter: on ? "brightness(1.08)" : undefined,
                }}
              />
              <span className="font-en text-[13px] whitespace-nowrap">
                {r.days}
                <span className="ml-0.5 font-tc text-[11px] text-ink-soft">天</span>
                {on && <span className="ml-1.5 text-[11px] text-ink-soft">{pct}%</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
