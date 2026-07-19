"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ThreadPhase } from "@/lib/use-thread-stream";

/** "Repository thinking" — the honest replacement for a typing indicator.
 * Each label is a *real* step the backend just performed (searching the
 * knowledge graph, reading the matched modules, composing the answer) with
 * real counts, so the user understands what Blueprint is doing rather than
 * watching performed cognition (PRODUCT.md bans fake thinking animations).
 * The three dots track a real state transition, not idle theater. */
export function ThinkingIndicator({ phase }: { phase: ThreadPhase | null }) {
  const label = phase?.label ?? "Searching the knowledge graph";
  return (
    <div className="flex items-center gap-2.5 text-[0.85rem] text-ink-500 dark:text-ink-400">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-accent-500"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
          />
        ))}
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {label}…
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
