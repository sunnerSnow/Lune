import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_UPDATED_AT, contactLine } from "@/lib/legal";

export const metadata: Metadata = { title: "使用條款" };

export default function TermsPage() {
  return (
    <>
      <p className="font-en text-xs tracking-[0.28em]">TERMS</p>
      <h1 className="mt-1 text-xl font-medium tracking-[0.14em]">使用條款</h1>
      <p className="mt-1 text-xs text-ink-soft">最後更新：{LEGAL_UPDATED_AT}</p>

      <p className="mt-5">使用 Luné（以下稱「本服務」）即表示你同意以下條款，也請一併閱讀
        <Link href="/privacy" className="underline underline-offset-4">隱私權政策</Link>。
      </p>

      <h2>本服務不是醫療服務</h2>
      <ul>
        <li>本服務只協助記錄與整理，不提供診斷、治療或用藥建議。</li>
        <li>週期與下次經期的預測都是依你過去紀錄算出的估算，<strong className="font-medium">不能作為避孕或備孕的依據</strong>。</li>
        <li>出血量、疼痛或週期變化讓你擔心時，請諮詢合格的醫療專業人員；遇到嚴重疼痛、大量出血或暈眩等情況，請立即就醫。</li>
      </ul>

      <h2>帳號</h2>
      <ul>
        <li>請妥善保管密碼。帳號被他人使用時，對方可以看到帳號底下所有 Profile 的紀錄。</li>
        <li>替他人（例如家人）建立 Profile 並記錄前，請先取得對方同意。</li>
        <li>不得以自動化方式大量註冊、嘗試登入他人帳號，或干擾本服務運作。</li>
      </ul>

      <h2>你的資料</h2>
      <ul>
        <li>你輸入的紀錄屬於你。你可以隨時匯出，或刪除帳號與所有資料。</li>
        <li>本服務不會將你的紀錄用於廣告，也不會出售。</li>
      </ul>

      <h2>服務提供</h2>
      <ul>
        <li>本服務依現狀提供，會盡力維持正常運作與資料安全，但無法保證完全不中斷或沒有錯誤。重要的紀錄請定期匯出備份。</li>
        <li>本服務可能調整功能。條款有變更時，會更新本頁的日期。</li>
      </ul>

      <h2>聯絡</h2>
      <p>{contactLine()}</p>
    </>
  );
}
