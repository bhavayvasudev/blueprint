"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { Repository, User } from "@blueprint/shared-types";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationsPopover } from "./NotificationsPopover";
import { ProfileMenu } from "./ProfileMenu";
import { RepoSwitcher } from "./RepoSwitcher";
import type { WorkspaceDialogKind } from "./WorkspaceShell";
import { BlueprintMark, IconSearch } from "./icons";

/** The workspace's one navigation surface — a floating pill, not a
 * docked header. Left cluster is identity + context (logo, repo
 * switcher); right cluster is utility (search, notifications, theme,
 * account). Room-to-room navigation lives in the dock below, not here —
 * this bar never disagrees with itself about what it's for. */
export function TopBar({
  user,
  repositories,
  activeRepoId,
  onOpenSearch,
  onOpenDialog,
}: {
  user: User;
  repositories: Repository[];
  activeRepoId: string | null;
  onOpenSearch: () => void;
  onOpenDialog: (dialog: WorkspaceDialogKind) => void;
}) {
  return (
    <motion.div
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 140, damping: 20, delay: 0.1 }}
      className="fixed inset-x-4 top-4 z-30 mx-auto flex max-w-4xl items-center justify-between gap-2 rounded-full sm:inset-x-6"
    >
      <div className="glass-strong edge-light flex items-center gap-1 rounded-full py-1.5 pl-2.5 pr-1.5 sm:gap-2">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-2.5">
          <BlueprintMark className="size-7 text-accent-500" />
          <span className="hidden text-sm font-semibold tracking-tight text-ink-950 sm:inline dark:text-ink-50">
            Blueprint
          </span>
        </Link>
        <div className="hidden h-5 w-px bg-ink-950/8 sm:block dark:bg-white/10" />
        <RepoSwitcher repositories={repositories} activeRepoId={activeRepoId} />
      </div>

      <div className="glass-strong edge-light flex items-center gap-1 rounded-full p-1.5">
        <motion.button
          type="button"
          onClick={onOpenSearch}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-ink-500 transition-colors hover:bg-ink-950/5 hover:text-ink-950 dark:text-ink-400 dark:hover:bg-white/8 dark:hover:text-ink-50"
          aria-label="Search"
        >
          <IconSearch className="size-4" />
          <span className="hidden md:inline">Search</span>
          <span className="hidden rounded-md border border-ink-200/70 px-1.5 py-0.5 font-mono text-xs text-ink-500 md:inline dark:border-ink-700/70 dark:text-ink-400">
            ⌘K
          </span>
        </motion.button>
        <NotificationsPopover repositories={repositories} />
        <ThemeToggle variant="flat" />
        <ProfileMenu user={user} onOpenDialog={onOpenDialog} />
      </div>
    </motion.div>
  );
}
