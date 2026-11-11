import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { resolveCurrentProfile } from "@/lib/services/profiles";
import type { Profile } from "@/lib/types";

/** 目前選的 Profile 存在 cookie；只是偏好，每次都由 resolveCurrentProfile 驗證歸屬 */
export const PROFILE_COOKIE = "lune-profile";

export async function getCurrentProfile(userId: string): Promise<Profile> {
  const preferred = (await cookies()).get(PROFILE_COOKIE)?.value ?? null;
  return resolveCurrentProfile(await getDb(), userId, preferred);
}

export async function setCurrentProfileCookie(profileId: string): Promise<void> {
  (await cookies()).set(PROFILE_COOKIE, profileId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}
