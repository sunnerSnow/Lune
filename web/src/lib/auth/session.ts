import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "@/lib/auth/better-auth";

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
}

/**
 * 取得目前登入的使用者（同一個請求內只查一次）。
 * 頁面、layout 與每個 Server Action 都要自己呼叫，不依賴 proxy 擋人。
 * Better Auth 會到資料庫核對 session token，不只是讀 cookie。
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // 先讀 headers：讓 next build 知道這是每個請求動態渲染的頁面
  const requestHeaders = await headers();
  const auth = await getAuth();
  const result = await auth.api.getSession({ headers: requestHeaders });
  if (!result?.user) return null;
  return {
    id: result.user.id,
    email: result.user.email ?? null,
    name: result.user.name ?? null,
    emailVerified: result.user.emailVerified === true,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
