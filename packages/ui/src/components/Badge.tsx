"use client";

import { Chip, type ChipProps } from "@heroui/react";
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

/* The nearest HeroUI color role per tone — the BEM layer stays honest
 * even though the Blueprint classes above repaint it. */
const HERO_COLOR: Record<BadgeTone, ChipProps["color"]> = {
  neutral: "default",
  ready: "success",
  indexing: "warning",
  failed: "danger",
  accent: "accent",
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
}

/** A status pill — HeroUI's Chip underneath, Blueprint's status hues on
 * top. Always icon/label, never color alone (RULES.md §16: "Color is
 * never the sole signal"). Settles in with a single spring overshoot on
 * mount — a "bounce" from spring physics, never a banned elastic easing
 * curve — so a status appearing registers as an event, not a silent
 * swap. `MotionConfig reducedMotion="user"` degrades this to an instant
 * render. */
export function Badge({ tone = "neutral", icon, children }: BadgeProps) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 15, mass: 0.5 }}
      className="inline-flex"
    >
      <Chip
        color={HERO_COLOR[tone]}
        className={`inline-flex items-center gap-1.5 rounded-full border-0 px-2.5 py-1 text-xs font-medium ${TONE_STYLES[tone]}`}
      >
        {icon}
        {children}
      </Chip>
    </motion.span>
  );
}
