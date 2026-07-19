"use client";

import { motion } from "framer-motion";
import { Reveal } from "@blueprint/ui";
import { IconThreads } from "@/components/workspace/icons";
import { SuggestionChips } from "./SuggestionChips";

/** The first thing you see: not a blinking cursor, but an invitation and a
 * set of real ways in. Every chip starts a new investigation. */
export function ThreadsEmptyState({
  repositoryName,
  suggestions,
  onPick,
  disabled,
}: {
  repositoryName: string;
  suggestions: string[];
  onPick: (question: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-7 px-6 py-10 text-center">
      <Reveal distance={14}>
        <span className="glass edge-light flex size-14 items-center justify-center rounded-2xl text-accent-600 dark:text-accent-400">
          <IconThreads className="size-6" />
        </span>
      </Reveal>
      <div className="flex flex-col gap-2.5">
        <Reveal delay={0.08} distance={18}>
          <h1
            className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            What would you like to understand?
          </h1>
        </Reveal>
        <Reveal delay={0.16} distance={14}>
          <p className="text-lg text-ink-500 dark:text-ink-400">
            Ask <span className="font-medium text-ink-700 dark:text-ink-200">{repositoryName}</span>{" "}
            directly. Every answer traces to the file and function it came from.
          </p>
        </Reveal>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24, type: "spring", stiffness: 200, damping: 24 }}
        className="w-full"
      >
        <div className="flex flex-wrap justify-center gap-2">
          <SuggestionChips suggestions={suggestions} onPick={onPick} disabled={disabled} />
        </div>
      </motion.div>
    </div>
  );
}
