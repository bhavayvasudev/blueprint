import type { Repository, Snapshot, SnapshotStatus } from "@blueprint/shared-types";
import { getArchitectureGraph, listSnapshots } from "./api";

export interface RepositoryFacts {
  topLanguage: string | null;
  confidencePercent: number | null;
  snapshotStatus: SnapshotStatus | null;
  /** The latest snapshot in full, not just its status — the seed each
   * `RepositoryCard` hands to `useSnapshotPolling` so it can follow its own
   * study live. Carried here so a list of cards needs no extra round trip
   * per card to start watching: several repositories can be studied at
   * once, and each card has to track its own without the server rendering
   * a stale status for the others. */
  latestSnapshot: Snapshot | null;
}

/** One real fact per repository — top language and parse confidence
 * from its latest ready snapshot's graph, never a fabricated "health
 * score" (RULES.md §18). Fetched in parallel, one round trip per repo,
 * so the repositories list and the dashboard's recent-repositories rail
 * can show more than name/status without duplicating this logic. */
export async function getRepositoryFacts(
  repositories: Repository[],
): Promise<Map<string, RepositoryFacts>> {
  const entries = await Promise.all(
    repositories.map(async (repository): Promise<[string, RepositoryFacts]> => {
      const snapshots = await listSnapshots(repository.id);
      const latest = snapshots[0] ?? null;
      if (!latest || latest.status !== "ready") {
        return [
          repository.id,
          {
            topLanguage: null,
            confidencePercent: null,
            snapshotStatus: latest?.status ?? null,
            latestSnapshot: latest,
          },
        ];
      }
      const graph = await getArchitectureGraph(repository.id, latest.id);
      const topLanguage =
        [...graph.language_mix].sort((a, b) => b.loc - a.loc)[0]?.language ?? null;
      const confidencePercent =
        graph.file_count > 0
          ? Math.round((graph.tree_sitter_status.full_confidence_files / graph.file_count) * 100)
          : null;
      return [
        repository.id,
        { topLanguage, confidencePercent, snapshotStatus: latest.status, latestSnapshot: latest },
      ];
    }),
  );
  return new Map(entries);
}
