import type { MethodRow } from "@/lib/insights";

/** "How I read it" — the study's method, stated as calibration for the
 * claims above it, deliberately not a row of stat tiles. Each entry is
 * a verb the pipeline actually performed, the count it produced, and
 * what that count means for trust. */
export function MethodRows({ rows }: { rows: MethodRow[] }) {
  return (
    <dl className="flex flex-col">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex flex-col gap-1 border-b border-ink-950/6 py-3.5 last:border-none sm:flex-row sm:items-baseline sm:gap-6 dark:border-white/6"
        >
          <dt className="w-24 shrink-0 text-sm font-medium text-ink-950 dark:text-ink-50">
            {row.label}
          </dt>
          <dd className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <span className="font-mono text-sm text-ink-800 dark:text-ink-200">{row.value}</span>
            <span className="text-sm text-ink-500 dark:text-ink-400">{row.note}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
