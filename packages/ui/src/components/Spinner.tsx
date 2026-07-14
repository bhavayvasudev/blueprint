import type { ReactNode } from "react";

const SIZES = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
} as const;

export interface SpinnerProps {
  size?: keyof typeof SIZES;
  className?: string;
}

/** The one indeterminate-progress glyph (MASTER.md §10) — a true loading
 * indicator, so it is allowed to loop; everything else in the product
 * animates only in response to the user or to real change. Always
 * `aria-hidden`: the accessible loading announcement belongs to the
 * wrapping control (`Loading`, or a Button in its loading state). */
export function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return (
    <svg
      className={`animate-spin ${SIZES[size]} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface LoadingProps {
  /** What is loading, stated plainly — "Analyzing repository…", never a
   * bare spinner (MASTER.md §10: the system never acts silently). */
  label?: ReactNode;
  className?: string;
}

/** Inline loading state for a region that is genuinely waiting on the
 * architect. For anything document-shaped that takes longer than ~1s,
 * prefer `Skeleton` (MASTER.md §10: no blocking spinners > 1s). */
export function Loading({ label = "Loading…", className = "" }: LoadingProps) {
  return (
    <div
      role="status"
      className={`flex items-center gap-2.5 text-sm text-ink-500 dark:text-ink-400 ${className}`}
    >
      <Spinner size="md" />
      <span>{label}</span>
    </div>
  );
}
