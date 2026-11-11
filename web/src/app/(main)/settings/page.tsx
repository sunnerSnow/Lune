import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { DeleteAccount } from "@/components/settings/delete-account";
import { ProfileManager } from "@/components/settings/profile-manager";
import { Icon } from "@/components/ui/icon";
import { PageTitle } from "@/components/ui/page-title";
import { requireUser } from "@/lib/auth/session";
import { getCurrentProfile } from "@/lib/current-profile";
import { getDb } from "@/lib/db/client";
import { listProfiles } from "@/lib/services/profiles";

export const metadata: Metadata = { title: "設定" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [profile, profiles] = await Promise.all([
    getCurrentProfile(user.id),
    listProfiles(await getDb(), user.id, { includeArchived: true }),
  ]);

  return (
    <div>
      <PageTitle en="SETTINGS" tc="設定" />

      <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="profiles-title" className="glass px-5 pt-4 pb-5">
          <h2 id="profiles-title" className="flex items-baseline gap-2 pb-3">
            <span className="font-en text-xs tracking-[0.28em]">PROFILES</span>
            <span className="text-xs tracking-[0.2em] text-ink-soft">Profile 管理</span>
          </h2>
          <ProfileManager profiles={profiles} currentId={profile.id} />
          <p className="mt-4 text-xs leading-relaxed tracking-wide text-ink-soft">
            每個 Profile 的經期、紀錄與預測完全分開。Profile 是同一個帳號底下的分類，不是各自的登入帳號。
          </p>
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="account-title" className="glass px-5 pt-4 pb-3">
            <h2 id="account-title" className="flex items-baseline gap-2 pb-3">
              <span className="font-en text-xs tracking-[0.28em]">ACCOUNT</span>
              <span className="text-xs tracking-[0.2em] text-ink-soft">帳號</span>
            </h2>
            <p className="border-t border-line py-3 text-sm tracking-wider break-all">{user.email}</p>
            <form action={logoutAction} className="border-t border-line">
              <button type="submit" className="flex min-h-12 w-full items-center justify-between text-sm tracking-[0.14em]">
                登出
                <span className="circle-btn sm" aria-hidden="true">
                  <Icon name="logout" size={16} />
                </span>
              </button>
            </form>
          </section>

          <section aria-labelledby="privacy-title" className="glass px-5 pt-4 pb-4">
            <h2 id="privacy-title" className="flex items-baseline gap-2 pb-3">
              <span className="font-en text-xs tracking-[0.28em]">PRIVACY</span>
              <span className="text-xs tracking-[0.2em] text-ink-soft">資料與隱私</span>
            </h2>
            <ul className="flex flex-col gap-2 border-t border-line py-3 text-[13px] leading-relaxed tracking-wide">
              <li>紀錄只存在你的帳號底下，不會傳給 AI 或第三方服務。</li>
              <li>網址只帶日期，不會出現症狀、經血量或備註。</li>
            </ul>
            {/* 一般 <a>：檔案下載，不要讓 Next 預先抓取 */}
            <a
              href="/api/export"
              download
              className="flex min-h-12 items-center justify-between border-t border-line text-sm tracking-[0.14em]"
            >
              下載我的資料（JSON）
              <span className="circle-btn sm" aria-hidden="true">
                <Icon name="down" size={16} />
              </span>
            </a>
            <DeleteAccount />
            <p className="flex gap-4 border-t border-line pt-3 text-xs tracking-[0.14em] text-ink-soft">
              <Link href="/privacy" className="underline underline-offset-4 hover:text-white">
                隱私權政策
              </Link>
              <Link href="/terms" className="underline underline-offset-4 hover:text-white">
                使用條款
              </Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
