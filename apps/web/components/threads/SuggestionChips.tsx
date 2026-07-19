"use client";

import { motion } from "framer-motion";
import { IconArrowRight } from "@/components/workspace/icons";

/** The suggestion / follow-up chips. Starters open a new investigation;
 * follow-ups continue the current one. Model-generated follow-ups are
 * repository-specific by construction (services/thread_service.py) — these
 * are never the generic "tell me more". */
export function SuggestionChips({
  suggestions,
  onPick,
  disabled,
}: {
  suggestions: string[];
  onPick: (question: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((suggestion, i) => (
        <motion.button
          key={suggestion}
          type="button"
          disabled={disabled}
          onClick={() => onPick(suggestion)}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 * i, type: "spring", stiffness: 260, damping: 22 }}
          whileHover={{ y: -1 }}
          className="glass edge-light group inline-flex items-center gap-1.5 rounded-full py-2 pl-3.5 pr-3 text-left text-[0.83rem] font-medium text-ink-700 transition hover:text-accent-600 disabled:pointer-events-none disabled:opacity-50 dark:text-ink-200 dark:hover:text-accent-400"
        >
          {suggestion}
          <IconArrowRight className="size-3.5 -translate-x-0.5 text-ink-400 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
        </motion.button>
      ))}
    </div>
  );
}
