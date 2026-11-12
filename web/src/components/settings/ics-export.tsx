"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { formatDate } from "@/lib/date/date-utils";
import { ICS_DESCRIPTION, ICS_TITLES, type IcsTitle } from "@/lib/export/ics-options";

/**
 * 把下一次預測加入行事曆：先預覽要匯出的事件（名稱可選、只有日期區間），確認後才下載 .ics。
 * 沒有預測時不能匯出，並說明原因。
 */
export function IcsExport({
  profileName,
  range,
}: {
  profileName: string;
  /** 下一次可能開始的日期區間；沒有預測為 null */
  range: { windowStart: string; windowEnd: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState<IcsTitle>(ICS_TITLES[0]);

  if (!range) {
    return (
      <div className="flex min-h-12 items-center justify-between border-t border-line text-sm tracking-[0.14em]">
        <span>
          預測加入行事曆（.ics）
          <span className="mt-0.5 block text-xs tracking-wider text-ink-soft">「{profileName}」目前沒有預測可以匯出</span>
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center justify-between border-t border-line text-left text-sm tracking-[0.14em]"
      >
        <span>
          預測加入行事曆（.ics）
          <span className="mt-0.5 block text-xs tracking-wider text-ink-soft">匯出前會先預覽內容</span>
        </span>
        <span className="circle-btn sm" aria-hidden="true">
          <Icon name="calendar" size={16} />
        </span>
      </button>
      {open && (
        <Sheet open onClose={() => setOpen(false)} title="加入行事曆">
          <p className="text-[13px] leading-relaxed tracking-wide text-ink-soft">
            會匯出「{profileName}」下一次可能開始的日期區間，變成一個全天事件。行事曆裡看不到經期、症狀、經血量、備註或 Profile 名稱。
          </p>

          <fieldset className="mt-4 border-0 p-0">
            <legend className="field-label mb-2">事件名稱</legend>
            <div role="radiogroup" aria-label="事件名稱" className="flex flex-wrap gap-2">
              {ICS_TITLES.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={title === t} onClick={() => setTitle(t)} className="chip">
                  {title === t && <Icon name="check" size={16} />}
                  {t}
                </button>
              ))}
            </div>
          </fieldset>

          <section aria-label="預覽" className="glass mt-5 px-4 py-3">
            <p className="text-[11px] tracking-[0.2em] text-ink-soft">預覽</p>
            <p className="mt-1 text-base font-medium tracking-[0.08em]">{title}</p>
            <p className="mt-0.5 text-[13px] tracking-wide">
              全天 · {formatDate(range.windowStart)} – {formatDate(range.windowEnd)}
            </p>
            <p className="mt-2 text-xs leading-relaxed tracking-wide text-ink-soft">{ICS_DESCRIPTION}</p>
          </section>

          <div className="mt-6 flex justify-center">
            {/* 一般 <a>：檔案下載，不要讓 Next 預先抓取 */}
            <a
              href={`/api/export/ics?title=${encodeURIComponent(title)}`}
              download
              onClick={() => setTimeout(() => setOpen(false), 300)}
              className="oval h-16 w-52 text-base"
            >
              下載 .ics
            </a>
          </div>
          <p className="mt-3 text-center text-[11px] leading-relaxed tracking-wider text-ink-soft">
            用手機或電腦的行事曆打開這個檔案就會加入。預測改變時需要重新匯出。
          </p>
        </Sheet>
      )}
    </>
  );
}
