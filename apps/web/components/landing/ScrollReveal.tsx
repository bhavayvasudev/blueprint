"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
  /** Content is already visible by default (opacity 1, no transform) so
   * it never depends on the observer firing — the entrance only
   * enhances scroll-into-view, it never gates visibility. */
  once?: boolean;
}

/** `Reveal`'s scroll-triggered sibling — same spring-and-blur cinematic
 * entrance, but keyed off `whileInView` instead of mount, for the long
 * scroll a marketing page needs. Starts from a visible base state so a
 * paused tab or a headless render never ships blank content. */
export function ScrollReveal({
  children,
  className = "",
  delay = 0,
  distance = 32,
  once = true,
}: ScrollRevealProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0.001, y: distance, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once, margin: "-10% 0px -10% 0px" }}
      transition={{ type: "spring", stiffness: 100, damping: 20, mass: 0.9, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export interface ScrollStaggerProps {
  children: ReactNode[];
  className?: string;
  itemClassName?: string;
  stagger?: number;
}

/** Scroll-triggered sibling of `StaggerList` — a group of items (feature
 * cards, timeline rows) that draw in sequence as the group enters view. */
export function ScrollStagger({ children, className = "", itemClassName = "", stagger = 0.08 }: ScrollStaggerProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={className}>
      {children.map((child, index) => (
        <motion.div
          key={index}
          initial={reduceMotion ? false : { opacity: 0.001, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
          transition={{ duration: 0.5, delay: reduceMotion ? 0 : index * stagger, ease: "easeOut" }}
          className={itemClassName}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
