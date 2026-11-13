import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * 不用登入就能看的頁面：隱私權政策、使用條款要在註冊前就讀得到；
 * 忘記密碼、重設密碼、驗證 Email 是從信裡的連結進來，那時通常沒有登入。
 */
const PUBLIC_PATHS = new Set([
  "/login",
  "/privacy",
  "/terms",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  // 排程：Vercel Cron 沒有登入 cookie，路由自己用 CRON_SECRET 驗證
  "/api/cron/reminders",
]);

/**
 * 只做「樂觀的」未登入導向 /login：看有沒有 session cookie，不查資料庫。
 * 真正的權限檢查在 (main) layout、每個 Server Action 與匯出路由裡（requireUser / getSessionUser）。
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PUBLIC_PATHS.has(pathname) && !getSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// 靜態資源、favicon 與 service worker（sw.js：瀏覽器背景更新時不一定帶 cookie）不需要登入
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
