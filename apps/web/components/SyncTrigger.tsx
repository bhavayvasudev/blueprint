"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isSnapshotActive, type Snapshot, type SnapshotStatus } from "@blueprint/shared-types";
import type { BadgeTone } from "@blueprint/ui";
import { Badge, Button, Text } from "@blueprint/ui";
import { useSnapshotPolling, useTriggerSync } from "@/lib/use-snapshot-polling";

const STATUS_TONE: Record<SnapshotStatus, BadgeTone> = {
  // Waiting is not working, and shouldn't borrow the working colour — a
  // queued study is quiet until a worker takes it.
  queued: "neutral",
  indexing: "indexing",
  ready: "ready",
  failed: "failed",
  // Deliberately not the failure tone: the user stopped this on purpose,
  // and colouring it like a defect would misreport what happened.
  cancelled: "neutral",
};

const STATUS_LABEL: Record<SnapshotStatus, string> = {
  queued: "Queued",
  indexing: "Studying…",
  ready: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
};

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
  const isActive = current !== null && isSnapshotActive(current.status);

  useEffect(() => {
    if (!isActive && snapshotQuery.dataUpdatedAt > 0) {
      router.refresh();
    }
    // Only re-run when the watched snapshot's status actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.status]);

  // Disabled while queued as well as while studying: a study that is
  // already waiting for a worker does not need a second one enqueued
  // behind it. This is a per-repository guard — it says nothing about
  // whether *other* repositories are being studied, which is exactly the
  // conflation that used to make concurrent studies impossible.
  const isSyncing = syncMutation.isPending || isActive;

  return (
    <div className="flex items-center gap-3">
      {current ? (
        <Badge tone={STATUS_TONE[current.status]}>
          {current.status === "queued" && current.queue_position !== null
            ? `Queued · #${current.queue_position}`
            : STATUS_LABEL[current.status]}
        </Badge>
      ) : (
        <Text size="sm" tone="secondary">
          Not yet synced
        </Text>
      )}
      <Button
        variant="primary"
        size="sm"
        disabled={isSyncing}
        loading={syncMutation.isPending}
        onClick={() => syncMutation.mutate(undefined, { onSuccess: () => router.refresh() })}
      >
        {current?.status === "queued"
          ? "Queued…"
          : isSyncing
            ? "Syncing…"
            : current
              ? "Sync again"
              : "Sync now"}
      </Button>
    </div>
  );
}
