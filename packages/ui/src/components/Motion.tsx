"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export interface FadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

/** Motion clarifies, never decorates (RULES.md §17) — a single fade/rise
 * used for content that's genuinely appearing for the first time (a
 * section becoming available once a snapshot is ready), not applied on
 * every page load for spectacle. Respects `prefers-reduced-motion` via
 * `useReducedMotion` (RULES.md §16). */
export function FadeIn({ children, delay = 0, className }: FadeInProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export interface StaggerListProps {
  children: ReactNode[];
  className?: string;
  itemClassName?: string;
}

/** Staggers a list of items in on first render — the "graph edges draw
 * in sequentially, communicating this was constructed" pattern
 * (RULES.md §17), generalized to any list of real, newly-rendered
 * items (module cards, language rows) rather than built bespoke per
 * surface. */
export function StaggerList({ children, className, itemClassName }: StaggerListProps) {
  const reduceMotion = useReducedMotion();
  return (
    <div className={className}>
      {children.map((child, index) => (
        <motion.div
          key={index}
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: reduceMotion ? 0 : index * 0.04, ease: "easeOut" }}
          className={itemClassName}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
