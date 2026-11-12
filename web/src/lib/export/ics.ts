import "server-only";
import { createHash } from "node:crypto";
import { addDays } from "@/lib/date/date-utils";

/**
 * 匯出到行事曆（.ics，RFC 5545）。只放「下一次可能開始的日期區間」：
 * - 事件名稱是中性的預設選項之一，不寫「經期」；描述只說這是估算。
 * - 不含任何健康紀錄內容（症狀、經血量、備註），也不含 Profile 名稱。
 * - 全天事件：DTEND 是「結束日的隔天」（RFC 5545 的全天事件結束日不含當天）。
 * - UID 用 Profile ID 與開始日的雜湊：重新匯入同一次預測會更新同一個事件，而且不露出 ID 本身。
 */
import { ICS_DESCRIPTION, type IcsTitle } from "@/lib/export/ics-options";

export { ICS_DESCRIPTION, ICS_TITLES, type IcsTitle, isIcsTitle } from "@/lib/export/ics-options";

/** 文字欄位的跳脫：反斜線、分號、逗號、換行 */
export function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** 每行最多 75 個位元組，超過就折行（續行以一個空白開頭）；不切斷多位元組字元 */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    const limit = out.length === 0 ? 75 : 74; // 續行的開頭空白也算一個位元組
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

const compact = (date: string) => date.replaceAll("-", "");

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export interface IcsWindow {
  windowStart: string;
  windowEnd: string;
}

export function predictionIcs(
  window: IcsWindow,
  { title, profileId, now = new Date() }: { title: IcsTitle; profileId: string; now?: Date },
): string {
  const uid = createHash("sha256").update(`${profileId}:${window.windowStart}`).digest("hex").slice(0, 24);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lune//Cycle export//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@lune`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${compact(window.windowStart)}`,
    `DTEND;VALUE=DATE:${compact(addDays(window.windowEnd, 1))}`,
    `SUMMARY:${icsText(title)}`,
    `DESCRIPTION:${icsText(ICS_DESCRIPTION)}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
