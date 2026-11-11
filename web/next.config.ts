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
  poweredByHeader: false,
  // 安全標頭：健康紀錄頁面不能被其他網站嵌入（點擊劫持）；網址只帶日期，但仍不把它當 referrer 送給別站
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Content-Security-Policy",
        value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
      },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
        : []),
    ];
    return [{ source: "/:path*", headers: security }];
  },
};

export default nextConfig;
