import { cronSecret } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { createPushSender } from "@/lib/push";
import { cronAuthorized } from "@/lib/reminders/cron-auth";
import { runReminders } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";
// 每則通知最多等 10 秒；使用者多起來要改成分批
export const maxDuration = 60;

/**
 * 每天台灣時間早上 9 點由 Vercel Cron 呼叫（vercel.json；免費方案只保證在那一個小時內）。
 * 回應只有計數，不含任何使用者或 Profile 資訊。
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const sender = createPushSender();
  if (!sender) return Response.json({ skipped: "push_not_configured" });
  try {
    const result = await runReminders(await getDb(), sender);
    console.log(
      `[lune cron] reminders today=${result.today} profiles=${result.profiles} reminders=${result.reminders} sent=${result.sent} gone=${result.gone} failed=${result.failed}`,
    );
    return Response.json(result);
  } catch (error) {
    console.error(`[lune cron] 失敗：${(error as Error).name}`);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
