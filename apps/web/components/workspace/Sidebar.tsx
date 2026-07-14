"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { Repository, User } from "@blueprint/shared-types";
import { initials, repoDisplayName } from "@/lib/format";
import { BlueprintMark, IconChevronDown, IconPlus } from "./icons";
import { WORKSPACE_NAV } from "./nav";

const CONNECTION_DOT = {
  connected: "bg-status-ready",
  error: "bg-status-failed",
  revoked: "bg-status-failed",
} as const;

/** The workspace's left rail — a floating glass column, not a docked
 * bar: logo + command hint, the workspace rooms, the connected
 * repositories, and the signed-in engineer. */
export function Sidebar({
  user,
  repositories,
  activeNav,
  activeRepoId,
}: {
  user: User;
  repositories: Repository[];
  activeNav: string;
  activeRepoId: string | null;
}) {
  return (
    <motion.aside
      initial={{ x: -32, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 20 }}
      className="glass-strong edge-light fixed bottom-4 left-4 top-4 z-30 hidden w-60 flex-col overflow-hidden rounded-3xl lg:flex"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <BlueprintMark className="size-8 text-accent-500" />
        <span className="text-base font-semibold tracking-tight text-ink-950 dark:text-ink-50">
          Blueprint
        </span>
        <span className="ml-auto rounded-md border border-ink-200/70 px-1.5 py-0.5 font-mono text-xs text-ink-500 dark:border-ink-700/70 dark:text-ink-400">
          ⌘K
        </span>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4">
        {/* Workspace rooms */}
        <div className="flex flex-col gap-0.5">
          <SectionLabel>Workspace</SectionLabel>
          {WORKSPACE_NAV.map((item) => {
            const href = item.href(activeRepoId);
            const isActive = item.key === activeNav;
            const Icon = item.icon;
            const inner = (
              <>
                {isActive ? (
                  <motion.span
                    layoutId="sidebar-active"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-ink-950/6 shadow-sm ring-1 ring-ink-950/8 dark:bg-white/8 dark:ring-white/10"
                  />
                ) : null}
                <Icon
                  className={`relative size-4.5 shrink-0 ${
                    isActive ? "text-accent-600 dark:text-accent-400" : ""
                  }`}
                />
                <span className="relative">{item.label}</span>
                {href === null ? (
                  <span
                    className="relative ml-auto size-1.5 rounded-full bg-ink-300 dark:bg-ink-600"
                    title={item.unavailableHint}
                  />
                ) : null}
              </>
            );
            const itemClass = `group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "text-ink-950 dark:text-ink-50"
                : href
                  ? "text-ink-600 hover:text-ink-950 dark:text-ink-400 dark:hover:text-ink-50"
                  : "cursor-default text-ink-400 dark:text-ink-600"
            }`;
            return href ? (
              <motion.div key={item.key} whileHover={{ x: 3 }} transition={{ type: "spring", stiffness: 400, damping: 26 }}>
                <Link href={href} className={itemClass}>
                  {inner}
                </Link>
              </motion.div>
            ) : (
              <div key={item.key} className={itemClass} aria-disabled title={item.unavailableHint}>
                {inner}
              </div>
            );
          })}
        </div>

        {/* Repositories */}
        <div className="flex flex-col gap-0.5">
          <SectionLabel>Repositories</SectionLabel>
          {repositories.map((repository) => (
            <motion.div
              key={repository.id}
              whileHover={{ x: 3 }}
              transition={{ type: "spring", stiffness: 400, damping: 26 }}
            >
              <Link
                href={`/repo/${repository.id}`}
                className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:text-ink-950 dark:text-ink-400 dark:hover:text-ink-50"
              >
                <span className="relative flex size-4.5 items-center justify-center">
                  <span
                    className={`size-1.5 rounded-full ${CONNECTION_DOT[repository.connection_status]}`}
                  />
                  {repository.id === activeRepoId && repository.connection_status === "connected" ? (
                    <span className="absolute size-3 animate-ping rounded-full bg-status-ready/30" />
                  ) : null}
                </span>
                <span className="truncate">{repoDisplayName(repository.full_name)}</span>
              </Link>
            </motion.div>
          ))}
          <Link
            href="/dashboard#connect"
            className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-500 transition-colors hover:text-accent-600 dark:text-ink-500 dark:hover:text-accent-400"
          >
            <IconPlus className="size-4.5 transition-transform group-hover:rotate-90" />
            New Repository
          </Link>
        </div>
      </nav>

      {/* Signed-in engineer */}
      <div className="border-t border-ink-950/6 px-3 py-3 dark:border-white/6">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-ink-950/4 dark:hover:bg-white/5"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-ink-50 ring-1 ring-white/10 dark:bg-ink-100 dark:text-ink-950 dark:ring-ink-950/10">
            {initials(user.name)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-ink-950 dark:text-ink-50">
              {user.name}
            </span>
            <span className="text-xs text-ink-500 dark:text-ink-400">Owner</span>
          </span>
          <IconChevronDown className="ml-auto size-4 text-ink-400" />
        </button>
      </div>
    </motion.aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-widest text-ink-400 dark:text-ink-500">
      {children}
    </span>
  );
}
