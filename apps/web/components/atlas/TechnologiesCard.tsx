import type { DetectedStack } from "@blueprint/shared-types";
import { Surface } from "@blueprint/ui";
import { IconCheck } from "@/components/workspace/icons";

const CATEGORY_SUFFIX: Record<string, string> = {
  frontend: "frontend",
  backend: "backend",
  database: "database",
  ml: "ML",
  api: "API",
};

/** "Detected" — real matches only, read as sentences instead of pills
 * ("React frontend", not a bare "React" badge): a framework appears
 * because its exact package name sat in a manifest file this study
 * actually read (`pipeline/ingestion/stack_detection.py`). Nothing here
 * was guessed from a folder name or a file's contents. */
export function TechnologiesCard({ stack }: { stack: DetectedStack | null }) {
  const frameworks = stack?.frameworks ?? [];

  if (frameworks.length === 0) {
    return (
      <Surface padding="md" className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink-950 dark:text-ink-50">Detected</h3>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          No frameworks matched — this study found no recognized manifests.
        </p>
      </Surface>
    );
  }

  return (
    <Surface padding="md" className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink-950 dark:text-ink-50">Detected</h3>
      <ul className="flex flex-col gap-2">
        {frameworks.map((fw) => {
          const suffix = CATEGORY_SUFFIX[fw.category];
          return (
            <li
              key={fw.name}
              className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-300"
              title={`Found in ${fw.manifest_path}`}
            >
              <IconCheck className="mt-0.5 size-4 shrink-0 text-status-ready-deep dark:text-status-ready" />
              {suffix ? `${fw.name} ${suffix}` : fw.name}
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}
