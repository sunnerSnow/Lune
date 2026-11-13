import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions";
import { DeleteAccount } from "@/components/settings/delete-account";
import { EmailVerification } from "@/components/settings/email-verification";
import { IcsExport } from "@/components/settings/ics-export";
import { ProfileManager } from "@/components/settings/profile-manager";
import { Icon } from "@/components/ui/icon";
import { PageTitle } from "@/components/ui/page-title";
import { requireUser } from "@/lib/auth/session";
import { mailReady } from "@/lib/config";
import { getCurrentProfile } from "@/lib/current-profile";
import { computeCycleSummary } from "@/lib/cycle/cycle-predictor";
import { getDb } from "@/lib/db/client";
import { listPeriods } from "@/lib/services/periods";
import { listProfiles } from "@/lib/services/profiles";
import { getToday } from "@/lib/today";

export const metadata: Metadata = { title: "設定" };

export default async function SettingsPage() {
  const user = await requireUser();
  const db = await getDb();
  const [profile, profiles, today] = await Promise.all([
    getCurrentProfile(user.id),
    listProfiles(db, user.id, { includeArchived: true }),
    getToday(),
  ]);
  const { prediction } = computeCycleSummary(await listPeriods(db, user.id, profile.id), profile, today);

  return (
    <div>
      <PageTitle en="SETTINGS" tc="設定" />

      <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="profiles-title" className="glass px-5 pt-4 pb-5">
            <SectionTitle id="profiles-title" en="PROFILES" tc="Profile 管理" />
            <ProfileManager profiles={profiles} currentId={profile.id} />
            <p className="mt-4 text-xs leading-relaxed tracking-wide text-ink-soft">
              每個 Profile 的經期、紀錄與預測完全分開。Profile 是同一個帳號底下的分類，不是各自的登入帳號。
            </p>
          </section>

          <section aria-labelledby="export-title" className="glass px-5 pt-4 pb-3">
            <SectionTitle id="export-title" en="EXPORT" tc="匯出" />
            {/* 一般 <a>：檔案下載，不要讓 Next 預先抓取 */}
            <DownloadRow
              href="/api/export"
              label="下載我的資料（JSON）"
              note="所有 Profile、經期與每日紀錄，完整備份"
            />
            <DownloadRow
              href="/api/export/csv?kind=periods"
              label="經期紀錄（CSV）"
              note="可以用 Excel 或 Google 試算表開"
            />
            <DownloadRow
              href="/api/export/csv?kind=daily-logs"
              label="每日紀錄（CSV）"
              note="經血量、症狀、心情、備註"
            />
            <IcsExport
              profileName={profile.displayName}
              range={prediction ? { windowStart: prediction.windowStart, windowEnd: prediction.windowEnd } : null}
            />
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="account-title" className="glass px-5 pt-4 pb-3">
            <SectionTitle id="account-title" en="ACCOUNT" tc="帳號" />
            <p className="flex items-center justify-between gap-3 border-t border-line py-3 text-sm tracking-wider">
              <span className="break-all">{user.email}</span>
              {user.emailVerified && (
                <span className="flex flex-none items-center gap-1 text-xs tracking-[0.14em] text-ink-soft">
                  <Icon name="check" size={14} />
                  已驗證
                </span>
              )}
            </p>
            {!user.emailVerified && mailReady() && <EmailVerification />}
            <form action={logoutAction} className="border-t border-line">
              <button
                type="submit"
                className="flex min-h-12 w-full items-center justify-between text-sm tracking-[0.14em]"
              >
                登出
                <span className="circle-btn sm" aria-hidden="true">
                  <Icon name="logout" size={16} />
                </span>
              </button>
            </form>
          </section>

          <section aria-labelledby="privacy-title" className="glass px-5 pt-4 pb-4">
            <SectionTitle id="privacy-title" en="PRIVACY" tc="資料與隱私" />
            <ul className="flex flex-col gap-2 border-t border-line py-3 text-[13px] leading-relaxed tracking-wide">
              <li>紀錄只存在你的帳號底下，不會傳給 AI 或第三方服務。</li>
              <li>網址只帶日期，不會出現症狀、經血量或備註。</li>
              <li>匯出到行事曆時只有日期區間與中性的事件名稱。</li>
            </ul>
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

function SectionTitle({ id, en, tc }: { id: string; en: string; tc: string }) {
  return (
    <h2 id={id} className="flex items-baseline gap-2 pb-3">
      <span className="font-en text-xs tracking-[0.28em]">{en}</span>
      <span className="text-xs tracking-[0.2em] text-ink-soft">{tc}</span>
    </h2>
  );
}

function DownloadRow({ href, label, note }: { href: string; label: string; note: ReactNode }) {
  return (
    <a
      href={href}
      download
      className="flex min-h-12 items-center justify-between gap-3 border-t border-line py-1.5 text-sm tracking-[0.14em]"
    >
      <span>
        {label}
        <span className="mt-0.5 block text-xs tracking-wider text-ink-soft">{note}</span>
      </span>
      <span className="circle-btn sm" aria-hidden="true">
        <Icon name="down" size={16} />
      </span>
    </a>
  );
}
