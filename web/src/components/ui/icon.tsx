import type { SVGProps } from "react";

/** 細線圖示（1.5 描邊，跟方案 A 的細線語言一致）；裝飾用一律 aria-hidden */
const PATHS = {
  home: "M4 11.5 12 5l8 6.5M6.5 10v9h11v-9",
  calendar: "M4 8.5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-8ZM8 3.5v4M16 3.5v4M4 10h16",
  insights:
    "M6 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM18.5 15.8a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM7.4 14.5 10.6 10M13.9 9.6l3.2 3",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  left: "M14.5 6 8.5 12l6 6",
  right: "m9.5 6 6 6-6 6",
  down: "m7 10 5 5 5-5",
  check: "m5.5 12.5 4 4 9-9",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
  edit: "M5 19h4L19 9l-4-4L5 15v4Z",
  trash: "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12",
  logout: "M14 5h4v14h-4M10 8l-4 4 4 4M6 12h10",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01",
  stop: "M7 7h10v10H7z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0",
  archive: "M4 7h16v3H4zM6 10v9h12v-9M10 14h4",
  mail: "M4 7.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9ZM4.5 7l7.5 5.5L19.5 7",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  className,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** 經血量的水滴（實心） */
export function Drops({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex h-3 gap-px" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <svg key={i} viewBox="0 0 10 12" width={10} height={12} fill="currentColor">
          <path d="M5 0C5 0 0 5.6 0 8a5 4 0 0 0 10 0C10 5.6 5 0 5 0Z" />
        </svg>
      ))}
    </span>
  );
}
