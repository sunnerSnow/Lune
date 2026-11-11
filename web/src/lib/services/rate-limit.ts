import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/local";
import { withService } from "@/lib/db/with-user";

/**
 * 固定視窗限流：同一個 key 在 windowSeconds 內最多 max 次。
 * 用資料庫（lune.rate_limits）計數，所以 serverless 多個實例共用同一份；一次 upsert 完成，不需要鎖。
 * 回傳 true 表示允許（已計入這次）；false 表示超過上限。
 */
export async function consumeRateLimit(db: Db, key: string, max: number, windowSeconds: number): Promise<boolean> {
  // key 由使用者輸入（Email）決定，表會一直長；每 50 次左右順手清掉一天前的列
  if (Math.random() < 0.02) {
    await withService(db, (tx) =>
      tx.execute(sql`delete from lune.rate_limits where window_start < now() - interval '1 day'`),
    ).catch(() => {});
  }
  const rows = await withService(db, (tx) =>
    tx.execute(sql`
      insert into lune.rate_limits (key, count, window_start) values (${key}, 1, now())
      on conflict (key) do update set
        count = case when lune.rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else lune.rate_limits.count + 1 end,
        window_start = case when lune.rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else lune.rate_limits.window_start end
      returning count`),
  );
  const list = (Array.isArray(rows) ? rows : ((rows as { rows?: { count: number }[] }).rows ?? [])) as {
    count: number;
  }[];
  return (list[0]?.count ?? 0) <= max;
}

/**
 * 從請求標頭取用戶端 IP。Vercel 會覆寫 x-forwarded-for，所以可信；
 * 部署到沒有可信代理的環境時，這個標頭可被偽造，IP 維度的限流就只剩 Email 那層在擋。
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, 64);
}
