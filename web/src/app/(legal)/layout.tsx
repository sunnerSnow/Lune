import Link from "next/link";
import { BrandLockup } from "@/components/ui/brand-mark";
import { Icon } from "@/components/ui/icon";
import { Orb } from "@/components/ui/orb";

/** 隱私權政策、使用條款：不用登入就能看（註冊前要讀得到） */
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative z-[1] mx-auto w-full max-w-2xl overflow-x-clip px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-16">
      <Orb
        color="rose"
        size={180}
        soft
        className="animate-float-slow pointer-events-none absolute -top-10 -right-20 opacity-60"
      />
      <header className="relative flex items-center justify-between">
        <Link href="/login" aria-label="Luné">
          <BrandLockup size={28} idPrefix="legal" />
        </Link>
        {/* 右上角疊在粉色光球上：直接放白字只有約 2.7:1，半透明玻璃也只有 4.0:1，所以墊接近不透明的深藍膠囊 */}
        <Link
          href="/settings"
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-glass-line bg-sky-deep/90 pr-4 pl-2.5 text-xs tracking-[0.16em] text-white hover:underline hover:underline-offset-4"
        >
          <Icon name="left" size={16} />
          返回
        </Link>
      </header>
      <article className="glass relative mt-8 px-6 py-7 text-[14px] leading-[1.9] tracking-wide [&_h2]:mt-7 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-medium [&_h2]:tracking-[0.12em] [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </article>
    </div>
  );
}
