import type { CSSProperties } from "react";
import { cx } from "@/lib/cx";
import type { AvatarColor } from "@/lib/types";

/** 光球：漸層圓。soft＝柔邊（大型裝飾）、glow＝內外微光（小型標記） */
export function Orb({
  color = "rose",
  size,
  soft,
  glow,
  className,
  style,
}: {
  color?: AvatarColor;
  size?: number;
  soft?: boolean;
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx("orb", `orb-${color}`, soft && "orb-soft", glow && "orb-glow", className)}
      style={size ? { width: size, height: size, ...style } : style}
    />
  );
}
