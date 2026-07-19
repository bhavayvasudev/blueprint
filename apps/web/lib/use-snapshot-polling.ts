"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Snapshot } from "@blueprint/shared-types";
import { PUBLIC_API_BASE_URL } from "@/lib/config";

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

/** Shared poll for one snapshot's live status — `SyncTrigger` (header
 * badge/button) and `StudyProgress` (the main STUDYING/FAILED panel) both
 * subscribe to the same query key, so React Query dedupes them into one
 * real request/interval rather than two components each polling
 * independently. Polls only while `indexing` (RULES.md §14: this is
 * client-side polling of an already-202'd job, not a held-open request). */
export function useSnapshotPolling(repositoryId: string, initialSnapshot: Snapshot | null) {
  return useQuery({
    queryKey: ["snapshot", repositoryId, initialSnapshot?.id],
    queryFn: () => fetchSnapshot(repositoryId, initialSnapshot!.id),
    enabled: initialSnapshot !== null,
    initialData: initialSnapshot ?? undefined,
    refetchInterval: (query) => (query.state.data?.status === "indexing" ? 2000 : false),
  });
}

export function useTriggerSync(repositoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => triggerSync(repositoryId),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(["snapshot", repositoryId, snapshot.id], snapshot);
    },
  });
}
