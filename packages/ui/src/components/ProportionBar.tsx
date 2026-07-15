"use client";

import { motion, useReducedMotion } from "framer-motion";

export interface ProportionBarProps {
  label: string;
  count: number;
  countLabel: string;
  total: number;
}

/** A proportional bar over a real, counted total (e.g. language mix by
 * lines of code) — the literal count is always printed alongside the
 * bar, never a bare percentage standing alone (this PR's "avoid
 * placeholder percentages" scope: the ratio shown is a real, correct
 * computation over real numbers, not a fabricated confidence score, and
 * the numbers behind it are never hidden). The fill draws in once, as a
 * measurement being taken rather than a value that was just always
 * there — animated via `scaleX` (transform), never the layout-driving
 * `width`, so it stays off the layout thread. */
export function ProportionBar({ label, count, countLabel, total }: ProportionBarProps) {
  const reduceMotion = useReducedMotion();
  const share = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-ink-800 dark:text-ink-200">{label}</span>
        <span className="text-xs text-ink-500 dark:text-ink-400">{countLabel}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
        <motion.div
          initial={{ scaleX: reduceMotion ? share / 100 : 0 }}
          animate={{ scaleX: share / 100 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: "left" }}
          className="h-full w-full rounded-full bg-accent-500"
        />
      </div>
    </div>
  );
}
