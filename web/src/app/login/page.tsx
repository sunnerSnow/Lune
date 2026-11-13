import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loginLocalAction } from "@/app/actions";
import { BrandMark } from "@/components/ui/brand-mark";
import { Icon } from "@/components/ui/icon";
import { Orb } from "@/components/ui/orb";
import { LOCAL_USERS } from "@/lib/auth/local-users";
import { getSessionUser } from "@/lib/auth/session";
import { isLocalMode, isLocalModeInProduction, mailReady } from "@/lib/config";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "登入" };

/** 網址帶的提示（?notice=…、?deleted=1）→ 顯示在表單上方的訊息 */
const NOTICES: Record<string, string> = {
  "check-mail": "請到信箱收信，點信裡的連結完成註冊。幾分鐘內沒收到的話，看看垃圾郵件匣。",
  reset: "密碼已經更新，請用新密碼登入。",
  deleted: "帳號與所有資料已刪除。",
};

/** 登入頁：漂浮光球＋細線，中間是品牌字；表單放在玻璃面板 */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getSessionUser()) redirect("/dashboard");
  const local = isLocalMode();
  const localInProduction = isLocalModeInProduction();
  const params = await searchParams;
  const noticeKey = params.deleted === "1" ? "deleted" : typeof params.notice === "string" ? params.notice : "";
  const notice = Object.hasOwn(NOTICES, noticeKey) ? NOTICES[noticeKey] : null;

  return (
    <main className="relative z-[1] mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-clip px-5 pt-[env(safe-area-inset-top)] pb-12">
      <div className="relative h-[300px]" aria-hidden="true">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 300" fill="none" preserveAspectRatio="none">
          <g stroke="rgb(255 255 255 / 0.5)" strokeWidth="1">
            <path d="M60 -10 L170 150" />
            <path d="M200 160 L380 80" />
            <path d="M110 190 L30 300" />
          </g>
        </svg>
        <Orb color="rose" size={220} soft className="animate-float-slow absolute top-6 -left-20" />
        <Orb color="sage" size={80} glow className="animate-float absolute top-12 right-6" />
        <Orb color="lavender" size={44} glow className="animate-float-slow absolute top-[128px] right-[30%]" />
      </div>
      <div className="-mt-28 flex flex-col items-center text-center">
        <BrandMark size={56} idPrefix="login" className="mb-2" />
        <h1 className="logo text-[44px] tracking-[0.2em] drop-shadow-[0_0_24px_rgb(255_255_255/0.45)]">Luné</h1>
        <p className="mt-3 text-[13px] tracking-[0.3em]">輕輕記下，慢慢看懂自己</p>
      </div>

      {notice && (
        <p
          role="status"
          className="glass-deep mt-8 rounded-[20px] px-5 py-3 text-center text-sm leading-relaxed tracking-wider"
        >
          {notice}
        </p>
      )}

      {localInProduction && (
        <p role="alert" className="field-error mt-8 w-full items-start rounded-[16px] px-4 py-3 text-sm">
          <Icon name="info" size={16} className="mt-1 flex-none" />
          警告：這是正式建置卻開著本機示範模式（LUNE_LOCAL_MODE），只能在自己的電腦使用，不可公開部署。
        </p>
      )}

      {local && (
        <section aria-label="本機示範" className="glass mt-8 px-5 py-4">
          <p className="text-xs leading-relaxed tracking-wide text-ink-soft">
            本機示範模式：資料存在這台電腦的 <code className="font-en">web/.data/pglite</code>
            ，不是正式資料庫。兩位示範使用者的資料互相看不到。
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {LOCAL_USERS.map((u) => (
              <form key={u.key} action={loginLocalAction}>
                <input type="hidden" name="user" value={u.key} />
                <button type="submit" className="chip w-full justify-center">
                  以{u.label}登入{u.sample ? "（有範例資料）" : ""}
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      <section aria-label="登入或註冊" className="glass mt-5 px-5 pt-5 pb-6">
        <LoginForm canResetPassword={mailReady()} />
      </section>
      {/* 卡片外直接疊在背景上：用純白字（ink-soft 在背景上只有 4.0–4.4:1） */}
      <p className="mt-5 text-center text-[11px] leading-relaxed tracking-wider text-white">
        Luné 只協助記錄與估算，不提供醫療診斷；預測不可作為避孕依據。
        <br />
        註冊即表示同意
        <Link href="/terms" className="mx-1 underline underline-offset-4 hover:decoration-2">
          使用條款
        </Link>
        與
        <Link href="/privacy" className="mx-1 underline underline-offset-4 hover:decoration-2">
          隱私權政策
        </Link>
      </p>
    </main>
  );
}
