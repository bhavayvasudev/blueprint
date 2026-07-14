import type { ReactNode } from "react";

export interface KbdProps {
  children: ReactNode;
  className?: string;
}

/** A keyboard-key chip — the ⌘K affordance in the chrome, shortcut hints
 * in the command palette. Mono, tabular, compact-control radius
 * (MASTER.md §1, §3); always accompanied by a visible label or an
 * `aria-label` on the parent control, never the sole affordance. */
export function Kbd({ children, className = "" }: KbdProps) {
  return (
    <kbd
      className={`inline-flex min-w-5 items-center justify-center rounded-md border border-ink-200 bg-white/60 px-1.5 py-0.5 font-mono text-xs text-ink-500 dark:border-ink-700 dark:bg-ink-800/60 dark:text-ink-300 ${className}`}
    >
      {children}
    </kbd>
  );
}
