"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Snapshot } from "@blueprint/shared-types";
import { Badge, Text } from "@blueprint/ui";
import { useSnapshotPolling, useTriggerSync } from "@/lib/use-snapshot-polling";

const STATUS_TONE = { ready: "ready", indexing: "indexing", failed: "failed" } as const;

/** Indexing Status (RULES.md §17: motion communicates a real state
 * transition — this is one). Polls the snapshot it's watching only while
 * `indexing`; a `ready`/`failed` result refreshes the Server Component
 * tree once so the rest of the Architecture View picks up real data,
 * rather than duplicating the fetch client-side. Shares its poll with
 * `StudyProgress` (the main-panel view of the same snapshot) via
 * `useSnapshotPolling`'s query key, rather than each polling separately. */
export function SyncTrigger({
  repositoryId,
  initialSnapshot,
}: {
  repositoryId: string;
  initialSnapshot: Snapshot | null;
}) {
  const router = useRouter();
  const snapshotQuery = useSnapshotPolling(repositoryId, initialSnapshot);
  const syncMutation = useTriggerSync(repositoryId);

  const current = snapshotQuery.data ?? initialSnapshot;
  const wasIndexing = current?.status === "indexing";

  useEffect(() => {
    if (!wasIndexing && snapshotQuery.dataUpdatedAt > 0) {
      router.refresh();
    }
    // Only re-run when the watched snapshot's status actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.status]);

  const isSyncing = syncMutation.isPending || current?.status === "indexing";

  return (
    <div className="flex items-center gap-3">
      {current ? (
        <Badge tone={STATUS_TONE[current.status]}>
          {current.status === "indexing" ? "Indexing…" : current.status}
        </Badge>
      ) : (
        <Text size="sm" tone="secondary">
          Not yet synced
        </Text>
      )}
      <button
        type="button"
        onClick={() => syncMutation.mutate(undefined, { onSuccess: () => router.refresh() })}
        disabled={isSyncing}
        className="rounded-md bg-ink-950 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-ink-800 disabled:opacity-50 dark:bg-white dark:text-ink-950 dark:hover:bg-ink-100"
      >
        {isSyncing ? "Syncing…" : current ? "Sync again" : "Sync now"}
      </button>
    </div>
  );
}
