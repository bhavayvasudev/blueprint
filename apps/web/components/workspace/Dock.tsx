"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Magnetic } from "@blueprint/ui";
import { WORKSPACE_NAV } from "./nav";

/** The floating dock — mission control's bottom rail, and the
 * workspace's only room-to-room navigation surface (the top pill holds
 * context and utilities, not room links). The active room carries a
 * shared-layout accent pill that glides between items; every icon is
 * magnetic. Rooms from later phases sit in the dock (dimmed) so the
 * workspace shows its whole shape.
 *
 * Rooms only — Search is not one. It used to sit here as a fifth entry
 * that opened the palette, which meant the workspace showed two search
 * affordances (this one and the top pill's ⌘K button) that did the same
 * thing and so read as two different searches. The button in the top
 * pill is now the only one. */
export function Dock({
  activeNav,
  activeRepoId,
}: {
  activeNav: string;
  activeRepoId: string | null;
}) {
  return (
    <motion.nav
      initial={{ y: 64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 130, damping: 19, delay: 0.35 }}
      className="glass-strong edge-light fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full p-1.5"
      aria-label="Workspace navigation"
    >
      {WORKSPACE_NAV.map((item) => {
        const href = item.href(activeRepoId);
        const isActive = item.key === activeNav;
        const isLive = isActive || Boolean(href);
        const Icon = item.icon;
        const iconVariants = {
          rest: { rotate: 0 },
          hover: { rotate: isLive ? 6 : 0 },
        };
        const labelVariants = {
          rest: { x: 0 },
          hover: { x: isLive ? 2 : 0 },
        };
        const inner = (
          <>
            {isActive ? (
              <motion.span
                layoutId="dock-active"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="absolute inset-0 rounded-full bg-accent-500 shadow-lg shadow-accent-500/30"
              />
            ) : (
              <motion.span
                variants={{ rest: { opacity: 0 }, hover: { opacity: isLive ? 1 : 0 } }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 rounded-full bg-ink-950/6 dark:bg-white/8"
              />
            )}
            <motion.span
              variants={iconVariants}
              transition={{ type: "spring", stiffness: 300, damping: 16 }}
              className="relative flex shrink-0"
            >
              <Icon className="size-4" />
            </motion.span>
            <motion.span
              variants={labelVariants}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="relative hidden md:inline"
            >
              {item.dockLabel}
            </motion.span>
          </>
        );
        const itemClass = `relative flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
          isActive
            ? "text-white"
            : href
              ? "text-ink-600 hover:text-ink-950 dark:text-ink-300 dark:hover:text-ink-50"
              : "cursor-default text-ink-400 dark:text-ink-600"
        }`;

        return (
          <Magnetic key={item.key} strength={0.2}>
            {href ? (
              <motion.span
                initial="rest"
                whileHover="hover"
                whileTap={{ scale: 0.94 }}
                className="inline-flex"
              >
                <Link href={href} className={itemClass}>
                  {inner}
                </Link>
              </motion.span>
            ) : (
              <motion.span
                initial="rest"
                whileHover="hover"
                className={itemClass}
                aria-disabled
                title={item.unavailableHint}
              >
                {inner}
              </motion.span>
            )}
          </Magnetic>
        );
      })}
    </motion.nav>
  );
}
