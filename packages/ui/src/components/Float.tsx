"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export interface FloatProps {
  children: ReactNode;
  className?: string;
  /** Total vertical travel in px. */
  amplitude?: number;
  /** Seconds for one full drift cycle. */
  duration?: number;
  delay?: number;
}

/** Idle levitation — panels breathe on a slow vertical drift so the
 * workspace feels alive before any interaction. Offset `delay` between
 * siblings so they don't bob in lockstep. */
export function Float({
  children,
  className = "",
  amplitude = 8,
  duration = 7,
  delay = 0,
}: FloatProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      animate={{ y: [-amplitude / 2, amplitude / 2, -amplitude / 2] }}
      transition={{ repeat: Infinity, duration, ease: "easeInOut", delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
