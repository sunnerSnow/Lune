import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { dailyLogsCsv, periodsCsv } from "@/lib/export/csv";
import { exportUserData } from "@/lib/services/export";
import { getToday } from "@/lib/today";

/**
 * 下載 CSV：?kind=periods（經期紀錄）或 ?kind=daily-logs（每日紀錄）；含這個帳號所有 Profile。
 * 自己檢查登入、不快取；只有 GET、沒有副作用。
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("請先登入", { status: 401, headers: { "Cache-Control": "no-store" } });
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "periods" && kind !== "daily-logs") {
    return new Response("不支援的匯出種類", { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const data = await exportUserData(await getDb(), user.id);
  const body = kind === "periods" ? periodsCsv(data.profiles) : dailyLogsCsv(data.profiles);
  const filename = `lune-${kind}-${await getToday()}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
