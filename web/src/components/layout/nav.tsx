"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";
import { cx } from "@/lib/cx";

const ITEMS: { href: string; label: string; en: string; icon: IconName }[] = [
  { href: "/dashboard", label: "首頁", en: "HOME", icon: "home" },
  { href: "/calendar", label: "日曆", en: "CALENDAR", icon: "calendar" },
  { href: "/analytics", label: "分析", en: "INSIGHTS", icon: "insights" },
  { href: "/settings", label: "設定", en: "SETTINGS", icon: "settings" },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** 手機：浮在底部的玻璃膠囊；目前頁面上方有粉色光點 */
export function MobileNav() {
  const isActive = useActive();
  return (
    <nav
      aria-label="主要導覽"
      className="glass-deep fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 mx-auto flex h-16 max-w-md items-center justify-around rounded-[32px] lg:hidden"
    >
      {ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative flex min-h-12 min-w-16 flex-col items-center justify-center gap-0.5 text-[11px] tracking-[0.14em]",
              active ? "font-medium text-white" : "text-ink-soft",
            )}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 size-1.5 rounded-full bg-blush shadow-[0_0_8px_var(--color-blush)]"
              />
            )}
            <Icon name={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** 桌面：左側直排導覽（寬字距英文＋中文） */
export function SideNav() {
  const isActive = useActive();
  return (
    <nav aria-label="主要導覽" className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "group flex min-h-12 items-center gap-3 rounded-full px-4 transition-colors",
              active ? "bg-white/12 text-white" : "text-ink-soft hover:bg-white/8",
            )}
          >
            <span
              aria-hidden="true"
              className={cx("size-1.5 rounded-full", active ? "bg-blush shadow-[0_0_8px_var(--color-blush)]" : "bg-transparent")}
            />
            <span className="font-en text-[13px] tracking-[0.22em]">{item.en}</span>
            <span className="text-xs tracking-[0.18em]">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
