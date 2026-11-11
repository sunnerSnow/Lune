import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Luné 的頁面都是登入後的個人健康紀錄，沒有可共用的快取，所以不用 Cache Components；
  // 讀 cookie 的頁面自然是動態頁。
  cacheComponents: false,
  // 家目錄與上層資料夾另有 lockfile，明確指定根目錄避免 Next 誤判 monorepo
  outputFileTracingRoot: import.meta.dirname,
  // PGlite 會在執行時載入 WASM 與資料檔，postgres 是原生 TCP 驅動，都不要被打包
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
