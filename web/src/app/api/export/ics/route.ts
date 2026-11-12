import { getSessionUser } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/current-profile";
import { computeCycleSummary } from "@/lib/cycle/cycle-predictor";
import { getDb } from "@/lib/db/client";
import { isIcsTitle, predictionIcs } from "@/lib/export/ics";
import { listPeriods } from "@/lib/services/periods";
import { getToday } from "@/lib/today";

/**
 * 把目前 Profile 的下一次預測區間匯出成 .ics（?title= 只接受中性名稱的預設選項）。
 * 不含任何健康紀錄內容；沒有預測時回 404。
 */
export async function GET(request: Request): Promise<Response> {
  const noStore = { "Cache-Control": "no-store" };
  const user = await getSessionUser();
  if (!user) return new Response("請先登入", { status: 401, headers: noStore });
  const title = new URL(request.url).searchParams.get("title");
  if (!isIcsTitle(title)) return new Response("不支援的事件名稱", { status: 400, headers: noStore });

  const profile = await getCurrentProfile(user.id);
  const periods = await listPeriods(await getDb(), user.id, profile.id);
  const { prediction } = computeCycleSummary(periods, profile, await getToday());
  if (!prediction) return new Response("目前沒有可以匯出的預測", { status: 404, headers: noStore });

  return new Response(predictionIcs(prediction, { title, profileId: profile.id }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="lune-reminder.ics"',
      "Cache-Control": "no-store",
    },
  });
}
