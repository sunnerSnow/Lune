import { Icon } from "@/components/ui/icon";
import type { CycleWarning } from "@/lib/cycle/cycle-predictor";
import { formatDateRange } from "@/lib/date/date-utils";

/** 資料檢查提醒（間隔異常、忘了按結束、週期不規則）；不做任何醫療判斷 */
export function warningText(w: CycleWarning): string {
  switch (w.kind) {
    case "interval_too_short":
      return `${formatDateRange(w.startDate, w.nextStartDate)} 只隔 ${w.length} 天，可能重複記錄，沒有列入平均`;
    case "interval_too_long":
      return `${formatDateRange(w.startDate, w.nextStartDate)} 隔了 ${w.length} 天，可能漏記，沒有列入平均`;
    case "open_period_long":
      return `經期已經 ${w.days} 天，是不是忘了按結束？`;
    case "irregular":
      return "最近幾次週期長度差距較大，預測僅供參考";
  }
}

export function Notices({ warnings }: { warnings: CycleWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label="提醒">
      {warnings.map((w, i) => (
        <li key={i} className="glass flex items-start gap-2 rounded-[20px] px-4 py-3 text-[13px] leading-relaxed tracking-wide">
          <Icon name="info" size={18} className="mt-0.5" />
          {warningText(w)}
        </li>
      ))}
    </ul>
  );
}
