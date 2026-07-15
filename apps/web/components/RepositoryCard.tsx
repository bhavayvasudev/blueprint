"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Repository } from "@blueprint/shared-types";
import { Badge, Popover, PopoverDivider, PopoverItem, Surface, Text, Tilt } from "@blueprint/ui";
import { PUBLIC_API_BASE_URL } from "@/lib/config";
import type { RepositoryFacts } from "@/lib/repository-facts";
import { IconMore } from "./workspace/icons";

const CONNECTION_TONE = {
  connected: "ready",
  error: "failed",
  revoked: "failed",
} as const;

const SNAPSHOT_TONE = { ready: "ready", indexing: "indexing", failed: "failed" } as const;

async function triggerSync(repositoryId: string): Promise<void> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/repos/${repositoryId}/sync`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to trigger sync (${res.status})`);
}

/** The repository list's one row primitive — name, branch, visibility,
 * and (when a study exists) its real top language and parse confidence,
 * never a fabricated health score. Hover lifts, click springs, and a
 * context menu carries only actions the API actually supports (no
 * "disconnect" — that endpoint doesn't exist yet). */
export function RepositoryCard({
  repository,
  facts,
}: {
  repository: Repository;
  facts?: RepositoryFacts;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const syncMutation = useMutation({
    mutationFn: () => triggerSync(repository.id),
    onSuccess: () => router.refresh(),
  });

  const snapshotStatus = facts?.snapshotStatus ?? null;

  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -3 }}
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className="relative"
    >
      <Tilt maxTilt={2.5}>
        <Link href={`/repo/${repository.id}`} className="block">
          <Surface
            padding="md"
            className="transition-shadow hover:border-accent-400 hover:shadow-md dark:hover:border-accent-600"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="truncate font-mono text-sm font-medium text-ink-950 dark:text-ink-50">
                  {repository.full_name}
                </span>
                <Text size="sm" tone="secondary">
                  {repository.default_branch} &middot; {repository.private ? "private" : "public"}
                  {repository.last_synced_at
                    ? ` · last synced ${new Date(repository.last_synced_at).toLocaleString()}`
                    : " · never synced"}
                </Text>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {facts?.topLanguage ? <Badge>{facts.topLanguage}</Badge> : null}
                  {facts?.confidencePercent !== null && facts?.confidencePercent !== undefined ? (
                    <Badge>{facts.confidencePercent}% confidence</Badge>
                  ) : null}
                  {snapshotStatus ? (
                    <Badge tone={SNAPSHOT_TONE[snapshotStatus]}>
                      {snapshotStatus === "indexing" ? "indexing" : snapshotStatus}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge tone={CONNECTION_TONE[repository.connection_status]}>
                  {repository.connection_status}
                </Badge>
                <button
                  ref={triggerRef}
                  type="button"
                  aria-label={`Actions for ${repository.full_name}`}
                  aria-haspopup="menu"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setMenuOpen((open) => !open);
                  }}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-400 transition-colors hover:rotate-12 hover:bg-ink-950/5 hover:text-ink-800 dark:text-ink-500 dark:hover:bg-white/8 dark:hover:text-ink-200"
                >
                  <IconMore className="size-4" />
                </button>
              </div>
            </div>
          </Surface>
        </Link>
      </Tilt>

      <Popover
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        triggerRef={triggerRef}
        aria-label={`${repository.full_name} actions`}
        width={220}
        maxHeight={240}
      >
        <PopoverItem href={`/repo/${repository.id}`} onSelect={() => setMenuOpen(false)}>
          Open in Atlas
        </PopoverItem>
        {snapshotStatus === "ready" ? (
          <PopoverItem href={`/repo/${repository.id}/insights`} onSelect={() => setMenuOpen(false)}>
            View Insights
          </PopoverItem>
        ) : null}
        <PopoverDivider />
        <PopoverItem
          disabled={syncMutation.isPending || snapshotStatus === "indexing"}
          onSelect={() => {
            setMenuOpen(false);
            syncMutation.mutate();
          }}
        >
          {syncMutation.isPending ? "Syncing…" : "Sync now"}
        </PopoverItem>
      </Popover>
    </motion.div>
  );
}
