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
 * classes, so a later visual tweak (radius, border color) changes once.
 * Rendered in the workspace's glass material (`.glass` + `.edge-light`,
 * defined once in `apps/web/app/globals.css`): panels float over the
 * ambient stage instead of sitting flat on the page. */
export function Surface({ children, padding = "md", className = "", as: Tag = "div" }: SurfaceProps) {
  return (
    <Tag className={`glass edge-light rounded-2xl ${PADDING[padding]} ${className}`}>
      {children}
    </Tag>
  );
}
