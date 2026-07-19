import type { DetectedStack } from "@blueprint/shared-types";
import { Surface } from "@blueprint/ui";
import { IconCheck } from "@/components/workspace/icons";

/** The five rows the Briefing answers "what is this built with" in, and
 * which real `stack_detection` categories feed each.
 *
 * Languages come from the language census; the rest come from framework
 * matches, split by the `category` the detector already assigns. The split
 * is presentational only — a row exists because real manifest entries
 * landed in it, never to fill out the list. */
const ROWS: { label: string; categories: string[] }[] = [
  { label: "Frameworks", categories: ["frontend", "backend", "api"] },
  { label: "Database", categories: ["database"] },
  { label: "AI models", categories: ["ml"] },
  { label: "Infrastructure", categories: ["infra"] },
];

function Row({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="shrink-0 text-sm text-ink-500 sm:w-32 dark:text-ink-400">{label}</span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-800 dark:text-ink-200">
        <IconCheck className="size-4 shrink-0 text-status-ready-deep dark:text-status-ready" />
        {values.join(" · ")}
      </span>
    </div>
  );
}

/** "Detected" — the second thing the Briefing says, after the summary.
 *
 * Every value traces to one real line in one real manifest file that this
 * study read (`pipeline/ingestion/stack_detection.py`), which is why a row
 * with no matches is *omitted* rather than rendered as "None": an empty row
 * would read as a finding ("this project has no database") when the honest
 * claim is only that no recognized dependency matched. */
export function DetectedCard({ stack }: { stack: DetectedStack | null }) {
  const languages = (stack?.languages ?? []).map((language) => language.name);
  const frameworks = stack?.frameworks ?? [];

  const rows = [
    ...(languages.length > 0 ? [{ label: "Languages", values: languages }] : []),
    ...ROWS.map((row) => ({
      label: row.label,
      values: frameworks
        .filter((framework) => row.categories.includes(framework.category))
        .map((framework) => framework.name),
    })).filter((row) => row.values.length > 0),
  ];

  return (
    <Surface padding="md" className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-ink-950 dark:text-ink-50">Detected</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-500 dark:text-ink-400">
          No recognized manifests matched, so this study couldn’t name the stack. Languages and
          frameworks are read from dependency files — a project without one stays unread here rather
          than guessed at.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <Row key={row.label} label={row.label} values={row.values} />
          ))}
        </div>
      )}
    </Surface>
  );
}
