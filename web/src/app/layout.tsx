import type { Metadata, Viewport } from "next";
import "./globals.css";
// 字型自架（scripts/subset-font.py 產生）：建置不依賴 Google Fonts 下載是否成功
import "./fonts/outfit/outfit.css";
import "./fonts/noto-sans-tc/noto-sans-tc.css";

export const metadata: Metadata = {
  title: { default: "Luné", template: "%s · Luné" },
  description: "快速、簡單、低負擔的生理週期與身體狀態紀錄。",
  applicationName: "Luné",
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
