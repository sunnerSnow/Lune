import type { MetadataRoute } from "next";

/** PWA：可以「加到主畫面」，以獨立視窗開啟。圖示由 scripts/build-brand.mjs 產生 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Luné 生理期記錄",
    short_name: "Luné",
    description: "快速、簡單、低負擔的生理週期與身體狀態紀錄。",
    lang: "zh-Hant",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#3f6f86",
    theme_color: "#477a92",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
