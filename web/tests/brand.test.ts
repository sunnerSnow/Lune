import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MARK, RING } from "@/components/ui/brand-mark";

/**
 * 標誌的幾何寫在兩個地方：頁面元件（brand-mark.tsx）與產生圖示的腳本（scripts/build-brand.mjs）。
 * 這裡比對兩邊，避免只改一邊，造成網站上的標誌跟 favicon／App 圖示不一樣。
 */
const script = readFileSync(path.join(__dirname, "..", "scripts", "build-brand.mjs"), "utf8");

describe("品牌標誌：元件與產生腳本一致", () => {
  it("軌道路徑相同", () => {
    const m = /const RING =\s*"([^"]+)"/.exec(script);
    expect(m?.[1]).toBe(RING);
  });

  it("光球位置、半徑、線寬相同（一般尺寸與小尺寸）", () => {
    expect(script).toContain(`rose(p, ${MARK.rose.cx}, ${MARK.rose.cy}, ${MARK.rose.rSmall}) : rose(p, ${MARK.rose.cx}, ${MARK.rose.cy}, ${MARK.rose.r})`);
    expect(script).toContain(`lemon(p, ${MARK.lemon.cx}, ${MARK.lemon.cy}, ${MARK.lemon.rSmall}) : lemon(p, ${MARK.lemon.cx}, ${MARK.lemon.cy}, ${MARK.lemon.r})`);
    expect(script).toContain(`stroke-width="${MARK.ringWidthSmall}"`);
    expect(script).toContain(`stroke-width="${MARK.ringWidth}"`);
  });
});
