import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 排程路由的授權：Vercel Cron 會帶 `Authorization: Bearer <CRON_SECRET>`。
 * 沒設密鑰一律拒絕；比對用固定時間（先雜湊成同樣長度再比），不從回應時間洩漏密鑰。
 */
export function cronAuthorized(header: string | null, secret: string | null): boolean {
  if (!secret || !header) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
