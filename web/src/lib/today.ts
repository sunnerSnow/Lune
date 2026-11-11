import "server-only";
import { cookies } from "next/headers";
import { dateInTimezone, DEFAULT_TIMEZONE } from "@/lib/date/date-utils";

/**
 * 伺服器端的「今天」：依瀏覽器回報的時區（cookie `lune-tz`，由 TimezoneSync 寫入）計算。
 * 伺服器跑在 UTC，不能直接用伺服器時間判斷使用者的今天。
 * 寫入資料時仍由前端傳入當下的日期，服務層再確認合理範圍（requireToday）。
 */
export const TZ_COOKIE = "lune-tz";

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function getTimezone(): Promise<string> {
  const value = (await cookies()).get(TZ_COOKIE)?.value;
  const decoded = value ? safeDecode(value) : null;
  return isValidTimezone(decoded) ? decoded : DEFAULT_TIMEZONE;
}

export async function getToday(now: Date = new Date()): Promise<string> {
  return dateInTimezone(now, await getTimezone());
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
