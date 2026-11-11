import { Orb } from "@/components/ui/orb";
import { formatShortDate } from "@/lib/date/date-utils";
import { cx } from "@/lib/cx";

export interface ConstellationItem {
  key: string;
  /** 經期開始日 */
  date: string;
  /** 經期天數；進行中或預測為 null */
  length: number | null;
  kind: "predicted" | "ongoing" | "done";
  /** 到下一顆（較舊）光球的週期天數 */
  gapToOlder: number | null;
  /** 週期天數異常（未列入平均） */
  gapIssue: boolean;
}

const ROW = 64;
const WIDTH = 328;
const X = [118, 210];

/**
 * 最近幾次經期畫成星座：每次經期一顆光球，左右錯位往下排；連線上標出兩次開始日相隔的天數。
 * 最上面的虛線圈是預測的下一次。裝飾圖形 aria-hidden，資料另外用清單提供給輔助技術。
 */
export function Constellation({ items }: { items: ConstellationItem[] }) {
  const pts = items.map((it, i) => ({ x: X[i % 2], y: 32 + i * ROW, it }));
  const height = 32 * 2 + (items.length - 1) * ROW;
  return (
    <div className="relative mx-auto" style={{ width: WIDTH, height }}>
      <svg aria-hidden="true" width={WIDTH} height={height} className="absolute inset-0" fill="none">
        {pts.slice(0, -1).map((p, i) => (
          <line
            key={p.it.key}
            x1={p.x}
            y1={p.y}
            x2={pts[i + 1].x}
            y2={pts[i + 1].y}
            stroke="rgb(255 255 255 / 0.6)"
            strokeDasharray={p.it.kind === "predicted" ? "4 4" : undefined}
          />
        ))}
      </svg>
      {pts.map((p, i) => {
        const size = p.it.kind === "done" && p.it.length ? Math.min(56, Math.max(32, 26 + p.it.length * 4)) : 46;
        const leftSide = i % 2 === 0;
        return (
          <div key={p.it.key} aria-hidden="true">
            {p.it.kind === "predicted" ? (
              <span
                className="orb orb-predicted absolute"
                style={{ width: size, height: size, left: p.x - size / 2, top: p.y - size / 2 }}
              />
            ) : (
              <Orb
                color="rose"
                glow
                className="absolute"
                style={{ width: size, height: size, left: p.x - size / 2, top: p.y - size / 2 }}
              />
            )}
            <div
              className={cx("absolute text-xs leading-snug tracking-[0.06em]", leftSide ? "text-right" : "text-left")}
              style={
                leftSide
                  ? { right: WIDTH - p.x + size / 2 + 12, top: p.y - 18, width: 92 }
                  : { left: p.x + size / 2 + 12, top: p.y - 18, width: 92 }
              }
            >
              <b className="font-en block text-[15px] font-normal tracking-[0.08em]">{formatShortDate(p.it.date)}</b>
              {p.it.kind === "predicted" ? "預測" : p.it.kind === "ongoing" ? "進行中" : `${p.it.length} 天`}
            </div>
            {p.it.gapToOlder !== null && i < pts.length - 1 && (
              <span
                className={cx(
                  "font-en absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-glass-line bg-sky-deep/85 px-2.5 text-xs whitespace-nowrap",
                  p.it.kind === "predicted" && "border-dashed",
                )}
                style={{ left: (p.x + pts[i + 1].x) / 2, top: (p.y + pts[i + 1].y) / 2 }}
              >
                {p.it.kind === "predicted" ? "約 " : ""}
                {p.it.gapToOlder} 天{p.it.gapIssue ? "＊" : ""}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
