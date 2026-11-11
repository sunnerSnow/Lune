import type { Metadata } from "next";
import { LEGAL_UPDATED_AT, contactLine } from "@/lib/legal";

export const metadata: Metadata = { title: "隱私權政策" };

export default function PrivacyPage() {
  return (
    <>
      <p className="font-en text-xs tracking-[0.28em]">PRIVACY</p>
      <h1 className="mt-1 text-xl font-medium tracking-[0.14em]">隱私權政策</h1>
      <p className="mt-1 text-xs text-ink-soft">最後更新：{LEGAL_UPDATED_AT}</p>

      <p className="mt-5">
        Luné（以下稱「本服務」）協助你記錄生理週期與身體狀態。經期、症狀與心情屬於敏感的健康資料，本服務只收集提供功能所需的最少資料，並以保守的方式處理。
      </p>

      <h2>我們收集哪些資料</h2>
      <ul>
        <li>帳號資料：Email、顯示名稱、加密後的密碼（無法還原成原本的密碼）。</li>
        <li>Profile：名稱、代表色、預設週期與經期天數、是否顯示預測。</li>
        <li>經期紀錄：開始與結束日期、備註。</li>
        <li>每日紀錄：日期、經血量、症狀、心情、備註。</li>
        <li>
          登入紀錄：登入時的 IP 位址與瀏覽器資訊，用於維持登入狀態與防止暴力破解。登入嘗試次數的紀錄最多保留一天。
        </li>
      </ul>
      <p className="mt-2">本服務不收集出生日期、位置、聯絡人或其他與功能無關的資料。</p>

      <h2>資料的用途</h2>
      <ul>
        <li>顯示你的紀錄、月曆與週期分析，並估算下次經期。所有計算都只用你自己的紀錄。</li>
        <li>驗證身分、維持登入狀態、防止濫用。</li>
      </ul>
      <p className="mt-2">本服務不販售資料、不投放廣告，也不會把健康紀錄提供給 AI 或其他第三方分析。</p>

      <h2>儲存與第三方服務</h2>
      <ul>
        <li>資料存放在雲端資料庫服務 Neon（PostgreSQL），網站由 Vercel 提供主機服務。這兩家服務商只為了運作本服務而處理資料。</li>
        <li>傳輸一律經過 HTTPS 加密。</li>
        <li>除了程式本身的檢查，資料庫也以帳號隔離每一筆資料，多一道防線避免讀到其他帳號的紀錄。</li>
        <li>錯誤紀錄只記錄錯誤類型，不包含症狀、經血量或備註等內容。</li>
        <li>網址只會出現日期，不會出現任何健康紀錄內容。</li>
      </ul>

      <h2>Cookie</h2>
      <ul>
        <li>登入憑證：維持登入狀態，登出後失效。</li>
        <li>目前選擇的 Profile：記住你上次看的是哪個 Profile。</li>
        <li>時區：用來判斷你所在地的「今天」。</li>
      </ul>
      <p className="mt-2">本服務不使用廣告或第三方追蹤 Cookie，也沒有安裝網站分析工具。</p>

      <h2>保存期間、匯出與刪除</h2>
      <ul>
        <li>資料保存到你刪除為止。單筆紀錄可以隨時修改或刪除。</li>
        <li>在「設定 → 資料與隱私」可以下載你所有資料的 JSON 檔。</li>
        <li>在同一處可以刪除帳號：帳號、所有 Profile 與紀錄會立刻從資料庫刪除。雲端服務商的備份可能保留一段時間，到期後自動清除。</li>
      </ul>

      <h2>多個 Profile</h2>
      <p>
        一個帳號可以管理多個 Profile（例如家人）。Profile 是同一個帳號底下的分類，不是各自的登入帳號：能登入這個帳號的人，就能看到底下所有 Profile 的紀錄。替他人記錄前，請先取得對方同意。
      </p>

      <h2>政策更新與聯絡</h2>
      <p>政策有變更時，會更新本頁的日期。{contactLine()}</p>
    </>
  );
}
