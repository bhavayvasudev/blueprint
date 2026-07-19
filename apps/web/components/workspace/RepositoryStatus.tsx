import type { Repository } from "@blueprint/shared-types";
import type { BadgeTone } from "@blueprint/ui";
import { Badge } from "@blueprint/ui";
import type { ReactNode } from "react";
import { healthStatusLabel } from "@/lib/insights";
import { timeAgo } from "@/lib/format";

const HEALTH_TONE: Record<ReturnType<typeof healthStatusLabel>, BadgeTone> = {
  Healthy: "ready",
  "Needs attention": "indexing",
  "Needs work": "failed",
};

/** One metadata chip — a muted label and a strong value inside a glass
 * pill, matching the workspace's existing pill idiom (`glass edge-light
 * rounded-full`). */
function Chip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="glass edge-light inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs">
      <span className="text-ink-500 dark:text-ink-400">{label}</span>
      <span className="font-medium text-ink-900 dark:text-ink-100">{children}</span>
    </span>
  );
}

/** Repository Status — the repository's real metadata as clean chips.
 *
 * Every chip traces to something we actually store or counted this
 * study (visibility, default branch, last-indexed time, file/folder/
 * module counts, detected languages, the license-presence audit, the
 * computed health read). The GitHub-social fields the brief lists —
 * stars, forks, open issues, pull requests, contributors, repository
 * size, repository age — are deliberately absent: Blueprint does not
 * fetch or store them, and PRODUCT.md bans standing a number up that
 * isn't real. When we start pulling them from the GitHub API, they slot
 * in here; until then this card stays honest about what it knows. */
export function RepositoryStatus({
  repository,
  fileCount,
  folderCount,
  moduleCount,
  languages,
  lastIndexedIso,
  commitSha,
  healthScore,
  licenseDetected,
}: {
  repository: Repository;
  fileCount: number;
  folderCount: number;
  moduleCount: number;
  languages: string[];
  lastIndexedIso: string;
  commitSha: string | null;
  healthScore: number | null;
  licenseDetected: boolean;
}) {
  const health = healthScore !== null ? healthStatusLabel(healthScore) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={repository.private ? "neutral" : "accent"}>
        {repository.private ? "Private" : "Public"}
      </Badge>
      {health ? (
        <Badge tone={HEALTH_TONE[health]}>
          {health}
          <span className="ml-1.5 font-mono text-[0.65rem] opacity-70">{healthScore}/100</span>
        </Badge>
      ) : null}
      <Chip label="Branch">
        <span className="font-mono">{repository.default_branch}</span>
      </Chip>
      <Chip label="Files">{fileCount.toLocaleString()}</Chip>
      <Chip label="Folders">{folderCount.toLocaleString()}</Chip>
      <Chip label="Modules">{moduleCount.toLocaleString()}</Chip>
      {languages.length > 0 ? <Chip label="Languages">{languages.join(" · ")}</Chip> : null}
      <Chip label="License">{licenseDetected ? "Present" : "Missing"}</Chip>
      <Chip label="Indexed">{timeAgo(lastIndexedIso) ?? "just now"}</Chip>
      {commitSha ? (
        <Chip label="Commit">
          <span className="font-mono">{commitSha.slice(0, 7)}</span>
        </Chip>
      ) : null}
    </div>
  );
}
