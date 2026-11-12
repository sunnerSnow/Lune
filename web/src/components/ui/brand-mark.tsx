import { cx } from "@/lib/cx";

/**
 * Luné 標誌（C「週期軌道」）：傾斜的手繪橢圓是一個週期，玫瑰光球是今天，小光球是下一次。
 * 軌道用 currentColor（深底白、淺底深色）。
 * 幾何（RING、光球位置與半徑、小尺寸加粗規則）與 scripts/build-brand.mjs 的 markBody 相同，
 * tests/brand.test.ts 會比對兩邊，改一邊要一起改另一邊。
 * 同一頁可能出現兩次（手機頁首＋桌面側欄），漸層 id 用 idPrefix 區分。
 */
export const RING =
  "M14 53 C 14 36, 34 28, 52 28.5 C 72 29, 87 39, 86.5 53 C 86 67, 69 75.5, 50 75 C 31 74.5, 14.5 68, 14 53 Z";
/** 一般尺寸／小尺寸（< 40px，跟 favicon 同一套）的光球半徑與線寬 */
export const MARK = {
  rose: { cx: 71, cy: 31, r: 12.5, rSmall: 15 },
  lemon: { cx: 22, cy: 72, r: 4.2, rSmall: 6 },
  ringWidth: 2.4,
  ringWidthSmall: 6.5,
} as const;

export function BrandMark({ size = 28, idPrefix = "bm", className }: { size?: number; idPrefix?: string; className?: string }) {
  const id = (s: string) => `${idPrefix}-${s}`;
  const small = size < 40;
  const rose = small ? MARK.rose.rSmall : MARK.rose.r;
  const lemon = small ? MARK.lemon.rSmall : MARK.lemon.r;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={cx("flex-none", className)}
    >
      <defs>
        <radialGradient id={id("rA")} cx=".7" cy=".3" r=".5">
          <stop offset="0" stopColor="#E2506E" />
          <stop offset="1" stopColor="#E2506E" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("rB")} cx=".28" cy=".72" r=".55">
          <stop offset="0" stopColor="#F4B49E" />
          <stop offset="1" stopColor="#F4B49E" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("rC")} cx=".34" cy=".28" r=".56">
          <stop offset="0" stopColor="#EA9CC8" />
          <stop offset="1" stopColor="#EA9CC8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("lA")} cx=".62" cy=".46" r=".45">
          <stop offset="0" stopColor="#9FDDB4" />
          <stop offset="1" stopColor="#9FDDB4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("lB")} cx=".3" cy=".3" r=".55">
          <stop offset="0" stopColor="#F7F5CC" />
          <stop offset="1" stopColor="#F7F5CC" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("sh")} cx=".34" cy=".28" r=".42">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {!small && (
          <filter id={id("soft")} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        )}
      </defs>
      <g transform="rotate(-22 50 52)" fill="none" stroke="currentColor">
        {/* 一般尺寸多一圈柔光；小尺寸線條加粗、不加柔光（會糊） */}
        {!small && <path d={RING} strokeWidth="6" opacity=".18" filter={`url(#${id("soft")})`} />}
        <path d={RING} strokeWidth={small ? MARK.ringWidthSmall : MARK.ringWidth} strokeLinecap="round" />
      </g>
      {["#EE8DA2", `url(#${id("rC")})`, `url(#${id("rB")})`, `url(#${id("rA")})`, `url(#${id("sh")})`].map((fill) => (
        <circle key={fill} cx={MARK.rose.cx} cy={MARK.rose.cy} r={rose} fill={fill} />
      ))}
      {["#E8E89C", `url(#${id("lB")})`, `url(#${id("lA")})`, `url(#${id("sh")})`].map((fill) => (
        <circle key={fill} cx={MARK.lemon.cx} cy={MARK.lemon.cy} r={lemon} fill={fill} />
      ))}
    </svg>
  );
}

/** 組合標誌：標誌＋字標（字標用網頁字型 Outfit，跟 .logo 一致） */
export function BrandLockup({
  size = 28,
  idPrefix,
  className,
}: {
  size?: number;
  idPrefix?: string;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={size} idPrefix={idPrefix} />
      <span className="logo">Luné</span>
    </span>
  );
}
