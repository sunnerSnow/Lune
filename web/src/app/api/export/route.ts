import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { exportUserData } from "@/lib/services/export";
import { getToday } from "@/lib/today";

/**
 * 下載自己的所有資料（JSON）。自己檢查登入（proxy 只做樂觀導向），不快取、不給其他網站嵌入或讀取。
 * 只有 GET、沒有副作用；跨站導向到這裡只會讓檔案下載到使用者自己的電腦，對方讀不到內容。
 */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("請先登入", { status: 401, headers: { "Cache-Control": "no-store" } });
  const data = await exportUserData(await getDb(), user.id);
  const filename = `lune-export-${await getToday()}.json`;
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
