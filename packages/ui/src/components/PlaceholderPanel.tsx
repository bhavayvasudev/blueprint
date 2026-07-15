"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { Float } from "./Float";
import { Surface } from "./Surface";

export interface PlaceholderPanelProps {
  title: string;
  phase: string;
  description: string;
  icon?: ReactNode;
}

/** An honest "not built yet" slot — for future Findings/Roadmap/
 * Dependency Graph/Prompt Generation panels (PHASES.md Phases 1-7) that
 * this layout reserves space for without faking their content. Never
 * shows a number, a percentage, or a sample Finding — only what phase
 * produces it, so nothing here can be mistaken for a real result
 * (RULES.md §23: "never build... unexplained percentages"). */
export function PlaceholderPanel({ title, phase, description, icon }: PlaceholderPanelProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      animate={reduceMotion ? undefined : { opacity: [0.82, 1, 0.82] }}
      transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
    >
      <Surface className="border-dashed">
        <div className="flex flex-col items-start gap-3">
          {icon ? (
            <Float amplitude={5} duration={5.5}>
              <div className="text-ink-400 dark:text-ink-500">{icon}</div>
            </Float>
          ) : null}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-medium text-ink-700 dark:text-ink-300">{title}</h3>
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                {phase}
              </span>
            </div>
            <p className="max-w-xl text-sm text-ink-500 dark:text-ink-400">{description}</p>
          </div>
        </div>
      </Surface>
    </motion.div>
  );
}
