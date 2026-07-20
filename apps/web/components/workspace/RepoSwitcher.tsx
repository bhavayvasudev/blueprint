"use client";

import { motion } from "framer-motion";
import { Popover, PopoverDivider, PopoverItem, PopoverSectionLabel } from "@blueprint/ui";
import type { Repository } from "@blueprint/shared-types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { repoDisplayName } from "@/lib/format";
import { IconChevronDown, IconPlus } from "./icons";

const CONNECTION_DOT = {
  connected: "bg-status-ready",
  error: "bg-status-failed",
  revoked: "bg-status-failed",
} as const;

/** The repository switcher — the top pill's one piece of workspace-wide
 * context. Switching repositories routes into that repository's Atlas;
 * every other room that reads `activeRepoId` (the Insights page, the
 * dock) picks up the change the moment the route changes, because none
 * of them hold their own copy of "which repo" — the URL is the only
 * source of truth. */
export function RepoSwitcher({
  repositories,
  activeRepoId,
}: {
  repositories: Repository[];
  activeRepoId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const active = repositories.find((repo) => repo.id === activeRepoId) ?? null;

  if (repositories.length === 0) {
    return (
      <a
        href="/repositories"
        className="hidden items-center gap-2 truncate rounded-full px-3 py-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-accent-600 sm:inline-flex dark:text-ink-400 dark:hover:text-accent-400"
      >
        <IconPlus className="size-4" />
        Connect a repository
      </a>
    );
  }

  return (
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      align="start"
      aria-label="Switch repository"
      trigger={
        <motion.button
          type="button"
          whileHover={{ scale: 1.015 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 24 }}
          className="flex max-w-56 items-center gap-2 truncate rounded-full px-3 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-950/5 dark:text-ink-200 dark:hover:bg-white/8"
        >
          <span
            className={`size-1.5 shrink-0 rounded-full ${active ? CONNECTION_DOT[active.connection_status] : "bg-ink-300 dark:bg-ink-600"}`}
          />
          <span className="truncate">
            {active ? repoDisplayName(active.full_name) : "Select repository"}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 24 }}
            className="flex shrink-0"
          >
            <IconChevronDown className="size-3.5 text-ink-400" />
          </motion.span>
        </motion.button>
      }
    >
      <PopoverSectionLabel>Repositories</PopoverSectionLabel>
      {repositories.map((repository) => (
        <PopoverItem
          key={repository.id}
          hint={repository.id === activeRepoId ? "Current" : undefined}
          onSelect={() => {
            setOpen(false);
            router.push(`/repo/${repository.id}`);
          }}
        >
          <span className="flex items-center gap-2.5">
            <span className={`size-2 shrink-0 rounded-full ${CONNECTION_DOT[repository.connection_status]}`} />
            <span className="truncate">{repoDisplayName(repository.full_name)}</span>
          </span>
        </PopoverItem>
      ))}
      <PopoverDivider />
      <PopoverItem icon={<IconPlus />} href="/repositories" onSelect={() => setOpen(false)}>
        Browse all repositories
      </PopoverItem>
    </Popover>
  );
}
