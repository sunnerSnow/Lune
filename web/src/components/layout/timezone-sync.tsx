"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * 把瀏覽器的時區寫進 cookie（lune-tz），讓伺服器算出使用者的「今天」。
 * 跟伺服器目前用的時區不同時才寫入並重新整理一次。
 */
export function TimezoneSync({ serverTimezone }: { serverTimezone: string }) {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || tz === serverTimezone) return;
    // 伺服器不接受這個時區時會一直不同；每個分頁只嘗試一次，避免反覆重新整理
    try {
      if (sessionStorage.getItem("lune-tz-synced") === tz) return;
      sessionStorage.setItem("lune-tz-synced", tz);
    } catch {
      // 無痕模式等情況拿不到 sessionStorage：照樣寫 cookie，effect 只會在掛載時跑一次
    }
    document.cookie = `lune-tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [serverTimezone, router]);
  return null;
}
