"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Snapshot } from "@blueprint/shared-types";
import { Badge, Text } from "@blueprint/ui";
import { PUBLIC_API_BASE_URL } from "@/lib/config";

const STATUS_TONE = { ready: "ready", indexing: "indexing", failed: "failed" } as const;

async function fetchSnapshot(repositoryId: string, snapshotId: string): Promise<Snapshot> {
  const res = await fetch(
    `${PUBLIC_API_BASE_URL}/api/v1/repos/${repositoryId}/snapshots/${snapshotId}`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`Failed to load snapshot status (${res.status})`);
  return (await res.json()) as Snapshot;
}

async function triggerSync(repositoryId: string): Promise<Snapshot> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/repos/${repositoryId}/sync`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to trigger sync (${res.status})`);
  return (await res.json()) as Snapshot;
}

/** Indexing Status (RULES.md §17: motion communicates a real state
 * transition — this is one). Polls the snapshot it's watching only while
 * `indexing`; a `ready`/`failed` result refreshes the Server Component
 * tree once so the rest of the Architecture View picks up real data,
 * rather than duplicating the fetch client-side. */
export function SyncTrigger({
  repositoryId,
  initialSnapshot,
}: {
  repositoryId: string;
  initialSnapshot: Snapshot | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const snapshotQuery = useQuery({
    queryKey: ["snapshot", repositoryId, initialSnapshot?.id],
    queryFn: () => fetchSnapshot(repositoryId, initialSnapshot!.id),
    enabled: initialSnapshot !== null,
    initialData: initialSnapshot ?? undefined,
    refetchInterval: (query) => (query.state.data?.status === "indexing" ? 2000 : false),
  });

  const syncMutation = useMutation({
    mutationFn: () => triggerSync(repositoryId),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(["snapshot", repositoryId, snapshot.id], snapshot);
      router.refresh();
    },
  });

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
        onClick={() => syncMutation.mutate()}
        disabled={isSyncing}
        className="rounded-md bg-ink-950 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-ink-800 disabled:opacity-50 dark:bg-white dark:text-ink-950 dark:hover:bg-ink-100"
      >
        {isSyncing ? "Syncing…" : current ? "Sync again" : "Sync now"}
      </button>
    </div>
  );
}
