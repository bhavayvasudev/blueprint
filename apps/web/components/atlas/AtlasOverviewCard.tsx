import type { Repository } from "@blueprint/shared-types";
import type { BadgeTone } from "@blueprint/ui";
import { Badge, Surface } from "@blueprint/ui";
import type { ReactNode } from "react";
import { healthStatusLabel } from "@/lib/insights";

export const HEALTH_STATUS_TONE: Record<ReturnType<typeof healthStatusLabel>, BadgeTone> = {
  Healthy: "ready",
  "Needs attention": "indexing",
  "Needs work": "failed",
};

/** The Atlas's one overview card — everything "what is this, is it
 * healthy" needs in a single glance, replacing the separate Repository
 * Overview / Technologies cards. The health score still appears (it's
 * real, computed arithmetic, not "AI theater"), but as a qualitative
 * badge with the number as a quiet aside — the full weighted breakdown
 * lives one click away behind "Stats for nerds", never hidden further
 * than that (RULES.md: composition always reachable). */
export function AtlasOverviewCard({
  repository,
  healthScore,
  moduleCount,
  fileCount,
  languages,
}: {
  repository: Repository;
  healthScore: number;
  moduleCount: number;
  fileCount: number;
  languages: string[];
}) {
  const status = healthStatusLabel(healthScore);

  const rows: { label: string; value: ReactNode }[] = [
    {
      label: "Repository",
      value: <span className="font-mono text-sm">{repository.full_name}</span>,
    },
    {
      label: "Health",
      value: (
        <span className="flex items-center gap-2">
          <Badge tone={HEALTH_STATUS_TONE[status]}>{status}</Badge>
          <span className="font-mono text-xs text-ink-400 dark:text-ink-500">{healthScore}/100</span>
        </span>
      ),
    },
    { label: "Modules", value: moduleCount.toLocaleString() },
    { label: "Files", value: fileCount.toLocaleString() },
    { label: "Languages", value: languages.length > 0 ? languages.join(" • ") : "—" },
    { label: "Status", value: <Badge tone="ready">Ready</Badge> },
  ];

  return (
    <Surface padding="md" className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink-950 dark:text-ink-50">Repository</h3>
      <dl className="flex flex-col divide-y divide-ink-950/6 dark:divide-white/8">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sm text-ink-500 dark:text-ink-400">{row.label}</dt>
            <dd className="text-ink-950 dark:text-ink-50">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Surface>
  );
}
