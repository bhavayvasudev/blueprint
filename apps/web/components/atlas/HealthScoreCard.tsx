import type { HealthScore } from "@/lib/insights";
import { Surface } from "@blueprint/ui";

/** Repository Health — a computed score, never shown without its
 * composition one click away (RULES.md: "a confidence score is never
 * displayed without its composition being one click away"). The
 * `<details>` is open by default: this isn't fine print, it's the
 * point — four real, individually-checkable signals, not a single
 * opaque number. */
export function HealthScoreCard({ health }: { health: HealthScore }) {
  return (
    <Surface padding="md" className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink-950 dark:text-ink-50">Repository Health</h3>
        <span className="font-mono text-2xl font-semibold text-ink-950 dark:text-ink-50">
          {health.score}
          <span className="text-sm font-normal text-ink-400 dark:text-ink-500">/100</span>
        </span>
      </div>

      <dl className="flex flex-col gap-4">
        {health.factors.map((factor) => (
          <div key={factor.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm font-medium text-ink-800 dark:text-ink-200">{factor.label}</dt>
              <dd className="font-mono text-xs text-ink-500 dark:text-ink-400">
                {factor.scorePercent}/100 · weighted {factor.weightPercent}%
              </dd>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
              <div
                className="h-full rounded-full bg-accent-500"
                style={{ width: `${factor.scorePercent}%` }}
              />
            </div>
            <p className="text-xs text-ink-500 dark:text-ink-400">{factor.detail}</p>
          </div>
        ))}
      </dl>
    </Surface>
  );
}
