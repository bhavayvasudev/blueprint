import type { Repository } from "@blueprint/shared-types";
import { Badge, StatBlock, Surface } from "@blueprint/ui";
import { IconGitHub } from "./icons";

/** The one place raw counts are allowed to lead (PRODUCT.md's
 * "interpretation above evidence above inventory" is a Briefing rule,
 * not a workspace-wide ban) — a compact real inventory, four numbers
 * that are each independently checkable, no synthesized score among
 * them. */
export function RepositoryOverviewCard({
  repository,
  fileCount,
  moduleCount,
  importCount,
  confidencePercent,
}: {
  repository: Repository;
  fileCount: number;
  moduleCount: number;
  importCount: number;
  confidencePercent: number | null;
}) {
  return (
    <Surface padding="md" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink-950 dark:text-ink-50">Repository Overview</h3>
        <Badge tone={repository.private ? "neutral" : "accent"}>
          {repository.private ? "Private" : "Public"}
        </Badge>
      </div>

      <div className="flex items-center gap-2 truncate">
        <IconGitHub className="size-4 shrink-0 text-ink-400 dark:text-ink-500" />
        <span className="truncate font-mono text-sm text-ink-700 dark:text-ink-300">
          {repository.full_name}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-ink-950/6 pt-4 dark:border-white/8">
        <StatBlock label="Files" value={fileCount.toLocaleString()} />
        <StatBlock label="Modules" value={moduleCount.toLocaleString()} />
        <StatBlock label="Imports" value={importCount.toLocaleString()} />
        <StatBlock label="Confidence" value={confidencePercent === null ? "—" : `${confidencePercent}%`} />
      </div>
    </Surface>
  );
}
