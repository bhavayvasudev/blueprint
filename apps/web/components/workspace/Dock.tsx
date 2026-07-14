"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Magnetic } from "@blueprint/ui";
import { WORKSPACE_NAV } from "./nav";

/** The floating dock — mission control's bottom rail. The active room
 * carries a shared-layout accent pill that glides between items;
 * every icon is magnetic. Rooms from later phases sit in the dock
 * (dimmed) so the workspace shows its whole shape. */
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
        const Icon = item.icon;
        const inner = (
          <>
            {isActive ? (
              <motion.span
                layoutId="dock-active"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="absolute inset-0 rounded-full bg-accent-500 shadow-lg shadow-accent-500/30"
              />
            ) : null}
            <Icon className="relative size-4 shrink-0" />
            <span className="relative hidden md:inline">{item.dockLabel}</span>
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
              <motion.span whileTap={{ scale: 0.94 }} className="inline-flex">
                <Link href={href} className={itemClass}>
                  {inner}
                </Link>
              </motion.span>
            ) : (
              <span className={itemClass} aria-disabled title={item.unavailableHint}>
                {inner}
              </span>
            )}
          </Magnetic>
        );
      })}
    </motion.nav>
  );
}
