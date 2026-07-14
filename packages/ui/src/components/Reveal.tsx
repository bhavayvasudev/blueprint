"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Distance the element rises from, in px — deeper layers use larger
   * values so a staggered group reads as depth, not as a queue. */
  distance?: number;
}

/** Cinematic entrance: content rises out of the z-axis (translate +
 * slight rotateX + blur resolving to sharp) on a spring — never a flat
 * fade-in. Use `delay` to stagger siblings. Reduces to a plain render
 * under `prefers-reduced-motion`. */
export function Reveal({ children, className = "", delay = 0, distance = 28 }: RevealProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: distance, rotateX: 9, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, rotateX: 0, filter: "blur(0px)" }}
      transition={{
        type: "spring",
        stiffness: 110,
        damping: 20,
        mass: 0.9,
        delay,
        filter: { type: "tween", duration: 0.5, delay, ease: "easeOut" },
      }}
      style={{ transformPerspective: 1000 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
