export interface ProportionBarProps {
  label: string;
  count: number;
  countLabel: string;
  total: number;
}

/** A proportional bar over a real, counted total (e.g. language mix by
 * lines of code) — the literal count is always printed alongside the
 * bar, never a bare percentage standing alone (this PR's "avoid
 * placeholder percentages" scope: the ratio shown is a real, correct
 * computation over real numbers, not a fabricated confidence score, and
 * the numbers behind it are never hidden). */
export function ProportionBar({ label, count, countLabel, total }: ProportionBarProps) {
  const share = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-ink-800 dark:text-ink-200">{label}</span>
        <span className="text-xs text-ink-500 dark:text-ink-400">{countLabel}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
        <div
          className="h-full rounded-full bg-accent-500"
          style={{ width: `${share}%` }}
        />
      </div>
    </div>
  );
}
