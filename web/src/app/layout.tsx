import type { Metadata, Viewport } from "next";
import "./globals.css";
// 字型自架（scripts/subset-font.py 產生）：建置不依賴 Google Fonts 下載是否成功
import "./fonts/outfit/outfit.css";
import "./fonts/noto-sans-tc/noto-sans-tc.css";

/** 分享預覽圖要用正式網址（不是每次部署各自的網址）：取 BETTER_AUTH_URL；沒設或格式不對就交給 Next 推斷 */
function siteUrl(): URL | undefined {
  const raw = process.env.BETTER_AUTH_URL?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

// 圖示、manifest、分享預覽圖用檔案慣例（app/icon.svg、favicon.ico、apple-icon.png、manifest.ts、opengraph-image.png）
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "Luné", template: "%s · Luné" },
  description: "快速、簡單、低負擔的生理週期與身體狀態紀錄。",
  applicationName: "Luné",
  appleWebApp: { title: "Luné", statusBarStyle: "black-translucent" },
  openGraph: {
    siteName: "Luné",
    title: "Luné：輕輕記下，慢慢看懂自己",
    description: "快速、簡單、低負擔的生理週期與身體狀態紀錄。",
    locale: "zh_TW",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#477a92",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className="h-full">
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
