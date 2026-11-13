import { type NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { setCurrentProfileCookie } from "@/lib/current-profile";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/db/with-user";
import { resolveCurrentProfile } from "@/lib/services/profiles";

export const dynamic = "force-dynamic";

/**
 * 點提醒通知會打開這裡：切到通知對應的 Profile，再進首頁。
 * Profile 一定要屬於登入的帳號（resolveCurrentProfile 驗證）；不是就照原本的 Profile 進首頁。
 * 只切換「目前看哪個 Profile」這個偏好，不改任何資料。
 */
export async function GET(request: NextRequest): Promise<Response> {
  const home = new URL("/dashboard", request.nextUrl.origin);
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  const wanted = request.nextUrl.searchParams.get("profile");
  if (isUuid(wanted)) {
    const profile = await resolveCurrentProfile(await getDb(), user.id, wanted);
    if (profile.id === wanted) await setCurrentProfileCookie(profile.id);
  }
  return NextResponse.redirect(home);
}
