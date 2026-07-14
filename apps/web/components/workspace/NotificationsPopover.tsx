"use client";

import { Popover, PopoverSectionLabel } from "@blueprint/ui";
import type { Repository } from "@blueprint/shared-types";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { timeAgo } from "@/lib/format";
import { buildNotifications, hasRecentActivity } from "@/lib/notifications";
import { IconBell } from "./icons";

const TONE_DOT = {
  ready: "bg-status-ready",
  failed: "bg-status-failed",
  neutral: "bg-ink-300 dark:bg-ink-600",
} as const;

/** Notifications derived entirely from the repositories the workspace
 * already has — sync completions, connection issues, unstudied repos.
 * No fabricated counts, no invented event log; an empty feed says so
 * plainly rather than inventing filler. */
export function NotificationsPopover({ repositories }: { repositories: Repository[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();

  const items = buildNotifications(repositories);
  const showDot = hasRecentActivity(items);

  return (
    <>
      <motion.button
        ref={triggerRef}
        type="button"
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="relative flex size-9 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-ink-950/5 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-white/8 dark:hover:text-ink-50"
      >
        <IconBell className="size-4.5" />
        {showDot && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent-500" />}
      </motion.button>

      <Popover open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} align="end" width={340} aria-label="Notifications">
        <PopoverSectionLabel>Recent activity</PopoverSectionLabel>
        {items.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-ink-500 dark:text-ink-400">
            Nothing yet — connect a repository and I&apos;ll let you know when the study
            completes.
          </p>
        ) : (
          <ul className="flex flex-col pb-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    router.push(`/repo/${item.repositoryId}`);
                  }}
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ink-950/5 dark:hover:bg-white/8"
                >
                  <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${TONE_DOT[item.tone]}`} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm text-ink-700 dark:text-ink-300">{item.message}</span>
                    {item.timestamp && (
                      <span className="text-xs text-ink-400 dark:text-ink-500">
                        {timeAgo(item.timestamp)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Popover>
    </>
  );
}
