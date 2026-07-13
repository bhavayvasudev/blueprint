import type { ReactNode } from "react";

const PADDING = {
  sm: "p-4", // 16px
  md: "p-6", // 24px
  lg: "p-8", // 32px
} as const;

export interface SurfaceProps {
  children: ReactNode;
  padding?: keyof typeof PADDING;
  className?: string;
  as?: "div" | "section" | "article";
}

/** The one card/panel primitive (RULES.md §18) — every bordered block in
 * the product is a `Surface`, never a one-off `div` with inline border
 * classes, so a later visual tweak (radius, border color) changes once. */
export function Surface({ children, padding = "md", className = "", as: Tag = "div" }: SurfaceProps) {
  return (
    <Tag
      className={`rounded-xl border border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900 ${PADDING[padding]} ${className}`}
    >
      {children}
    </Tag>
  );
}
