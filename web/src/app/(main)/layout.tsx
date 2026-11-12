import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { MobileNav, SideNav } from "@/components/layout/nav";
import { ProfileSwitcher } from "@/components/layout/profile-switcher";
import { TimezoneSync } from "@/components/layout/timezone-sync";
import { RecordProvider } from "@/components/logs/record-provider";
import { BrandLockup } from "@/components/ui/brand-mark";
import { Icon } from "@/components/ui/icon";
import { ToastProvider } from "@/components/ui/toast";
import { requireUser } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/current-profile";
import { getDb } from "@/lib/db/client";
import { listProfiles } from "@/lib/services/profiles";
import { getTimezone, getToday } from "@/lib/today";

/**
 * 登入後的頁面群：確認 session（查資料庫）→ 目前 Profile（cookie 只是偏好，伺服器驗證歸屬）
 * → 手機底部玻璃導覽／桌面左側導覽＋頂部 Profile 切換器。
 */
export default async function MainLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [profile, profiles, timezone, today] = await Promise.all([
    getCurrentProfile(user.id),
    listProfiles(await getDb(), user.id),
    getTimezone(),
    getToday(),
  ]);

  return (
    <ToastProvider>
      <TimezoneSync serverTimezone={timezone} />
      <RecordProvider profileId={profile.id} today={today}>
        <div className="relative z-[1] flex min-h-dvh w-full overflow-x-clip">
          <aside className="sticky top-0 z-40 hidden h-dvh w-64 flex-none flex-col gap-10 px-6 py-8 lg:flex">
            <Link href="/dashboard" className="px-4" aria-label="Luné 首頁">
              <BrandLockup size={30} idPrefix="side" />
            </Link>
            <SideNav />
            <div className="mt-auto px-4 text-xs tracking-wider text-ink-soft">
              <p className="truncate">{user.email}</p>
              <form action={logoutAction} className="mt-2">
                <button type="submit" className="inline-flex min-h-11 items-center gap-2 tracking-[0.16em] hover:text-white">
                  <Icon name="logout" size={16} />
                  登出
                </button>
              </form>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            {/* iOS 加到主畫面後狀態列是半透明的（black-translucent）：頁首要讓出 safe-area-inset-top */}
            <header className="topbar-fade sticky top-0 z-30 flex h-[calc(64px+max(0.5rem,env(safe-area-inset-top)))] items-center justify-between px-5 pt-[max(0.5rem,env(safe-area-inset-top))] lg:px-10">
              <Link href="/dashboard" className="lg:invisible" aria-label="Luné 首頁">
                <BrandLockup size={28} idPrefix="top" />
              </Link>
              <ProfileSwitcher current={profile} profiles={profiles} />
            </header>
            <main className="mx-auto w-full max-w-md px-5 pb-32 lg:max-w-4xl lg:px-10 lg:pb-16">{children}</main>
          </div>
        </div>
        <MobileNav />
      </RecordProvider>
    </ToastProvider>
  );
}
