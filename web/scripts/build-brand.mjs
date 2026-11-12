/**
 * 產生 Luné 的品牌素材（標誌 C「週期軌道」）：
 *   node scripts/build-brand.mjs
 *
 * 1. 向量檔 → ../docs/brand/*.svg（標誌、App 圖示、favicon、字標、組合標誌）
 * 2. 用電腦上的 Chrome（Playwright channel: chrome）轉成 PNG／ICO：
 *    - src/app/icon.svg、src/app/favicon.ico（16／32／48）、src/app/apple-icon.png（180）
 *    - public/icons/icon-192.png、icon-512.png、maskable-512.png（PWA）
 *    - ../docs/brand/avatar-1024.png（大頭貼，裁成圓形也安全）
 *    - src/app/opengraph-image.png（1200×630，分享預覽）
 *
 * 字標路徑來自 ../docs/brand/wordmark-path.json（scripts/wordmark-path.py 產生，Outfit 300、字距 0.16em）。
 * 標誌的幾何只定義在這裡；改了就重跑，所有尺寸一起更新。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.resolve(WEB, "..", "docs", "brand");
const INK = "#2B3A44";
const WHITE = "#FFFFFF";
const wordmark = JSON.parse(readFileSync(path.join(DOCS, "wordmark-path.json"), "utf8").replace(/^﻿/, ""));

// ---------------------------------------------------------------------------
// 幾何（viewBox 0 0 100 100）
// ---------------------------------------------------------------------------

/** 光球漸層（objectBoundingBox，任何大小的圓都適用）；prefix 讓同一份文件裡的 id 不重複 */
function orbDefs(p) {
  return `
    <radialGradient id="${p}rA" cx=".7" cy=".3" r=".5"><stop offset="0" stop-color="#E2506E"/><stop offset="1" stop-color="#E2506E" stop-opacity="0"/></radialGradient>
    <radialGradient id="${p}rB" cx=".28" cy=".72" r=".55"><stop offset="0" stop-color="#F4B49E"/><stop offset="1" stop-color="#F4B49E" stop-opacity="0"/></radialGradient>
    <radialGradient id="${p}rC" cx=".34" cy=".28" r=".56"><stop offset="0" stop-color="#EA9CC8"/><stop offset="1" stop-color="#EA9CC8" stop-opacity="0"/></radialGradient>
    <radialGradient id="${p}lA" cx=".62" cy=".46" r=".45"><stop offset="0" stop-color="#9FDDB4"/><stop offset="1" stop-color="#9FDDB4" stop-opacity="0"/></radialGradient>
    <radialGradient id="${p}lB" cx=".3" cy=".3" r=".55"><stop offset="0" stop-color="#F7F5CC"/><stop offset="1" stop-color="#F7F5CC" stop-opacity="0"/></radialGradient>
    <radialGradient id="${p}sh" cx=".34" cy=".28" r=".42"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
}
const tileDefs = (p) => `
    <linearGradient id="${p}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5E93AA"/><stop offset="1" stop-color="#3F6F86"/></linearGradient>
    <radialGradient id="${p}mist" cx=".18" cy=".05" r=".85"><stop offset="0" stop-color="#A9CCDB" stop-opacity=".6"/><stop offset="1" stop-color="#A9CCDB" stop-opacity="0"/></radialGradient>`;
const glowDef = (p) =>
  `<filter id="${p}soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>`;

const rose = (p, cx, cy, r) =>
  `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="#EE8DA2"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${p}rC)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${p}rB)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${p}rA)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${p}sh)"/></g>`;
const lemon = (p, cx, cy, r) =>
  `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="#E8E89C"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${p}lB)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${p}lA)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${p}sh)"/></g>`;

/** 手繪感的橢圓軌道（傾斜 -22°） */
const RING =
  "M14 53 C 14 36, 34 28, 52 28.5 C 72 29, 87 39, 86.5 53 C 86 67, 69 75.5, 50 75 C 31 74.5, 14.5 68, 14 53 Z";

/** 標誌本體：軌道＋玫瑰光球（今天）＋小光球（下一次）。small＝16–48px 用：線加粗、去掉微光、光球放大 */
function markBody(p, color, { small = false } = {}) {
  const ring = small
    ? `<path d="${RING}" fill="none" stroke="${color}" stroke-width="6.5" stroke-linecap="round"/>`
    : `<path d="${RING}" fill="none" stroke="${color}" stroke-width="6" opacity=".18" filter="url(#${p}soft)"/>
       <path d="${RING}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>`;
  return `<g transform="rotate(-22 50 52)">${ring}</g>
    ${small ? rose(p, 71, 31, 15) : rose(p, 71, 31, 12.5)}
    ${small ? lemon(p, 22, 72, 6) : lemon(p, 22, 72, 4.2)}`;
}

const svg = (viewBox, defs, body, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${extra}>\n  <defs>${defs}\n  </defs>\n  ${body}\n</svg>\n`;

const tile = (p, rx = 0) =>
  `<rect width="100" height="100"${rx ? ` rx="${rx}"` : ""} fill="url(#${p}bg)"/><rect width="100" height="100"${rx ? ` rx="${rx}"` : ""} fill="url(#${p}mist)"/>`;

// 標誌（透明底）
const markOn = (color) => svg("0 0 100 100", orbDefs("m") + glowDef("m"), markBody("m", color));
// App 圖示：滿版方形（iOS／Android 會自己裁圓角）
const appIcon = svg("0 0 100 100", tileDefs("t") + orbDefs("t") + glowDef("t"), tile("t") + markBody("t", WHITE));
// 圓角版（文件、提案用）
const appIconRounded = svg("0 0 100 100", tileDefs("t") + orbDefs("t") + glowDef("t"), tile("t", 22) + markBody("t", WHITE));
// maskable：Android 可能裁成圓形，標誌縮到中間 72% 的安全區
const maskable = svg(
  "0 0 100 100",
  tileDefs("t") + orbDefs("t") + glowDef("t"),
  `${tile("t")}<g transform="translate(14 14) scale(.72)">${markBody("t", WHITE)}</g>`,
);
// 大頭貼：常被裁成圓形、也常縮到 24–40px → 標誌縮在中間安全區；線寬與光球介於一般版和加粗版之間，
// 放大看不笨重、縮小也看得到軌道
const avatarBody = `<g transform="rotate(-22 50 52)">
    <path d="${RING}" fill="none" stroke="${WHITE}" stroke-width="8" opacity=".18" filter="url(#asoft)"/>
    <path d="${RING}" fill="none" stroke="${WHITE}" stroke-width="4.2" stroke-linecap="round"/></g>
    ${rose("a", 71, 31, 14)}${lemon("a", 22, 72, 5.4)}`;
const avatar = svg(
  "0 0 100 100",
  tileDefs("a") + orbDefs("a") + glowDef("a"),
  `${tile("a")}<g transform="translate(14 14) scale(.72)">${avatarBody}</g>`,
);
// favicon：小尺寸專用（線粗、光球大、沒有微光）
const favicon = svg("0 0 100 100", tileDefs("f") + orbDefs("f"), tile("f", 22) + markBody("f", WHITE, { small: true }));

// 字標（路徑，不依賴字型）：高度以大寫高度為準
const WM_SCALE = 0.1; // 字型單位 → 檔案單位（1000 units = 100）
const wmWidth = wordmark.width * WM_SCALE;
const wmAscent = 100; // 以 1em 當高度，é 的重音在大寫高度之上
const wordmarkSvg = (color) =>
  svg(
    `0 ${-wmAscent} ${wmWidth.toFixed(1)} ${wmAscent + 4}`,
    "",
    `<path transform="scale(${WM_SCALE})" fill="${color}" d="${wordmark.d}"/>`,
  );

// 組合標誌：標誌（100）＋間距 22＋字標（大寫高度約 40，垂直置中於軌道）
function lockup(color) {
  const capH = wordmark.capHeight * WM_SCALE * 0.58; // 字標縮到 58%
  const s = WM_SCALE * 0.58;
  const textW = wordmark.width * s;
  const baseline = 52 + capH / 2; // 大寫高度的中線對齊軌道中心（y=52）
  const w = 100 + 22 + textW;
  return svg(
    `0 0 ${w.toFixed(1)} 100`,
    orbDefs("l") + glowDef("l"),
    `${markBody("l", color)}<path transform="translate(122 ${baseline.toFixed(2)}) scale(${s.toFixed(4)})" fill="${color}" d="${wordmark.d}"/>`,
  );
}

// ---------------------------------------------------------------------------
// 輸出
// ---------------------------------------------------------------------------
mkdirSync(DOCS, { recursive: true });
const files = {
  "mark-on-dark.svg": markOn(WHITE),
  "mark-on-light.svg": markOn(INK),
  "app-icon.svg": appIcon,
  "app-icon-rounded.svg": appIconRounded,
  "app-icon-maskable.svg": maskable,
  "favicon.svg": favicon,
  "avatar.svg": avatar,
  "wordmark-on-dark.svg": wordmarkSvg(WHITE),
  "wordmark-on-light.svg": wordmarkSvg(INK),
  "lockup-on-dark.svg": lockup(WHITE),
  "lockup-on-light.svg": lockup(INK),
};
for (const [name, content] of Object.entries(files)) writeFileSync(path.join(DOCS, name), content);
writeFileSync(path.join(WEB, "src", "app", "icon.svg"), favicon);
console.log(`向量檔：${Object.keys(files).length} 個 → docs/brand/；favicon → src/app/icon.svg`);

// PNG／ICO
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function renderSvg(svgText, size, out, { transparent = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svgText).toString("base64")}" width="${size}" height="${size}" style="display:block"></body></html>`,
  );
  await page.waitForFunction(() => document.images[0]?.complete);
  const buf = await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  if (out) writeFileSync(out, buf);
  return buf;
}

/** ICO（內含 PNG，必須是 RGBA） */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

const ICONS = path.join(WEB, "public", "icons");
mkdirSync(ICONS, { recursive: true });
await renderSvg(appIcon, 180, path.join(WEB, "src", "app", "apple-icon.png"));
await renderSvg(appIcon, 192, path.join(ICONS, "icon-192.png"));
await renderSvg(appIcon, 512, path.join(ICONS, "icon-512.png"));
await renderSvg(maskable, 512, path.join(ICONS, "maskable-512.png"));
// 大頭貼（GitHub、Vercel、社群帳號）
await renderSvg(avatar, 1024, path.join(DOCS, "avatar-1024.png"));
const icoParts = [];
for (const size of [16, 32, 48]) icoParts.push({ size, buf: await renderSvg(favicon, size, null, { transparent: true }) });
writeFileSync(path.join(WEB, "src", "app", "favicon.ico"), ico(icoParts));

// 分享預覽圖：用自架字型排版後截圖
await page.setViewportSize({ width: 1200, height: 630 });
await page.goto(pathToFileURL(path.join(WEB, "scripts", "brand", "og.html")).href);
await page.evaluate((html) => {
  document.getElementById("lockup").innerHTML = html;
}, lockup(WHITE));
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(WEB, "src", "app", "opengraph-image.png") });

await browser.close();
console.log("PNG／ICO：apple-icon、icon-192／512、maskable-512、favicon.ico、opengraph-image");
