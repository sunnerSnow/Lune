import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/ui/brand-mark";
import { Orb } from "@/components/ui/orb";

/** 忘記密碼、重設密碼、驗證 Email：不用登入的單一表單頁，版型跟登入頁同一套 */
export function AuthShell({ en, title, children }: { en: string; title: string; children: ReactNode }) {
  return (
    <main className="relative z-[1] mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-clip px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-12">
      <Orb
        color="rose"
        size={180}
        soft
        className="animate-float-slow pointer-events-none absolute -top-10 -right-20 opacity-60"
      />
      <header className="relative">
        <Link href="/login" aria-label="Luné 登入頁" className="inline-flex min-h-11 items-center">
          <BrandLockup size={28} idPrefix="auth" />
        </Link>
      </header>
      <section aria-labelledby="auth-title" className="glass relative mt-10 px-5 pt-5 pb-6">
        <p className="font-en text-xs tracking-[0.28em]">{en}</p>
        <h1 id="auth-title" className="mt-1 text-xl font-medium tracking-[0.14em]">
          {title}
        </h1>
        <div className="mt-4">{children}</div>
      </section>
      {/* 卡片外直接疊在背景上：用純白字（ink-soft 在背景上只有 4.0–4.4:1） */}
      <p className="relative mt-3 text-center text-xs tracking-[0.14em]">
        <Link href="/login" className="inline-flex min-h-11 items-center underline underline-offset-4">
          回登入頁
        </Link>
      </p>
    </main>
  );
}

/** 完成或提示訊息（例如「信已寄出」） */
export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-sm leading-relaxed tracking-wide">
      {children}
    </p>
  );
}
