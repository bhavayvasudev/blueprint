"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "ready" | "indexing" | "failed" | "accent";

const TONE_STYLES: Record<BadgeTone, string> = {
  neutral: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
  ready: "bg-status-ready/10 text-status-ready-deep dark:text-status-ready",
  indexing: "bg-status-indexing/10 text-status-indexing-deep dark:text-status-indexing",
  failed: "bg-status-failed/10 text-status-failed-deep dark:text-status-failed",
  accent: "bg-accent-50 text-accent-700 dark:bg-accent-700/20 dark:text-accent-400",
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
}

/** A status pill — always icon/label, never color alone (RULES.md §16:
 * "Color is never the sole signal for Finding confidence or debt
 * severity"), applied here to every status badge in the product. Settles
 * in with a single spring overshoot on mount — a "bounce" that comes
 * from spring physics, never a banned elastic easing curve — so a
 * status appearing (sync starting, confidence resolving) registers as
 * an event, not a silent swap. `MotionConfig reducedMotion="user"`
 * degrades this to an instant render. */
export function Badge({ tone = "neutral", icon, children }: BadgeProps) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 15, mass: 0.5 }}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_STYLES[tone]}`}
    >
      {icon}
      {children}
    </motion.span>
  );
}
