"use client";

import { motion } from "framer-motion";
import type { User } from "@blueprint/shared-types";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { initials } from "@/lib/format";
import { IconBell, IconChevronDown } from "./icons";

/** The top-right chrome cluster: theme toggle, notifications, identity.
 * Floats over the stage rather than living in a header bar. */
export function TopBar({ user }: { user: User }) {
  return (
    <motion.div
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 140, damping: 20, delay: 0.15 }}
      className="fixed right-5 top-5 z-30 flex items-center gap-2.5"
    >
      <ThemeToggle />
      <motion.button
        type="button"
        aria-label="Notifications"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="glass edge-light relative flex size-9 items-center justify-center rounded-full text-ink-600 hover:text-ink-950 dark:text-ink-300 dark:hover:text-ink-50"
      >
        <IconBell className="size-4.5" />
        <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent-500" />
      </motion.button>
      <motion.button
        type="button"
        aria-label="Account"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="glass edge-light flex items-center gap-1.5 rounded-full p-1 pr-2 text-ink-600 dark:text-ink-300"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-ink-50 ring-1 ring-white/10 dark:bg-ink-100 dark:text-ink-950 dark:ring-ink-950/10">
          {initials(user.name)}
        </span>
        <IconChevronDown className="size-3.5" />
      </motion.button>
    </motion.div>
  );
}
