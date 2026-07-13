import type { ReactNode } from "react";

export interface StatBlockProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}

/** A labeled fact — always a literal, explainable value (a count, a
 * status, a name), never a bare percentage or score with no breakdown
 * (RULES.md §11, and this PR's own "no fabricated percentages" scope).
 * `detail` is where the "how this number was computed" one-liner goes,
 * kept adjacent rather than hidden behind a click, since everything
 * here is cheap to state plainly. */
export function StatBlock({ label, value, detail }: StatBlockProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">
        {label}
      </span>
      <span className="text-2xl font-semibold text-ink-950 dark:text-ink-50">{value}</span>
      {detail ? <span className="text-sm text-ink-500 dark:text-ink-400">{detail}</span> : null}
    </div>
  );
}
