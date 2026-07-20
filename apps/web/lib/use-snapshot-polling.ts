"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isSnapshotActive, type Snapshot } from "@blueprint/shared-types";
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

async function cancelStudy(repositoryId: string, snapshotId: string): Promise<Snapshot> {
  const res = await fetch(
    `${PUBLIC_API_BASE_URL}/api/v1/repos/${repositoryId}/snapshots/${snapshotId}/cancel`,
    { method: "POST", credentials: "include" },
  );
  if (!res.ok) throw new Error(`Failed to cancel the study (${res.status})`);
  return (await res.json()) as Snapshot;
}

/** Shared poll for one snapshot's live status — `SyncTrigger` (header
 * badge/button) and `StudyProgress` (the main STUDYING/FAILED panel) both
 * subscribe to the same query key, so React Query dedupes them into one
 * real request/interval rather than two components each polling
 * independently. Polls while the study is still in flight — `queued` as
 * well as `indexing`, since a queued study is waiting for a worker and its
 * position changes as the ones ahead finish (RULES.md §14: this is
 * client-side polling of an already-202'd job, not a held-open request).
 *
 * The query key is scoped to `[repositoryId, snapshotId]`, which is what
 * makes several simultaneous studies work without any coordination: every
 * repository card mounts this hook with its own key, so each gets its own
 * cache entry, its own interval and its own updates. Nothing is shared
 * between them, and one study finishing or failing neither stops nor
 * disturbs another's poll. */
export function useSnapshotPolling(repositoryId: string, initialSnapshot: Snapshot | null) {
  return useQuery({
    queryKey: ["snapshot", repositoryId, initialSnapshot?.id],
    queryFn: () => fetchSnapshot(repositoryId, initialSnapshot!.id),
    enabled: initialSnapshot !== null,
    initialData: initialSnapshot ?? undefined,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && isSnapshotActive(status) ? 2000 : false;
    },
  });
}

/** Cancels one study. Writes the returned snapshot straight into the same
 * per-snapshot query key the poll uses, so the card it belongs to updates
 * immediately and no other card is touched. */
export function useCancelStudy(repositoryId: string, snapshotId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelStudy(repositoryId, snapshotId!),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(["snapshot", repositoryId, snapshot.id], snapshot);
    },
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
