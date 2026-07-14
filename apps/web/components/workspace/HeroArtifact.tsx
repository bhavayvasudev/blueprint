"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BlueprintMark } from "./icons";

/** The hero's centerpiece — not a screenshot, not a metric card: a
 * physical rendering of what the product is (a repository, resolved
 * into layered structure). Three glass plates stacked on the same
 * accent the Atlas graph uses, turning slowly enough to read as an
 * object at rest, not a spinner. */
export function HeroArtifact() {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="relative"
      style={{ width: 220, height: 220, perspective: 1400 }}
      aria-hidden
    >
      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: "preserve-3d" }}
        animate={reduceMotion ? undefined : { rotateY: [0, 360] }}
        transition={reduceMotion ? undefined : { duration: 26, repeat: Infinity, ease: "linear" }}
        initial={{ rotateX: -10, rotateY: -18 }}
      >
        {[0, 1, 2].map((layer) => (
          <div
            key={layer}
            className="glass edge-light absolute inset-6 rounded-[2rem]"
            style={{
              transform: `translateZ(${layer * -22}px) rotate(${layer * 6}deg)`,
              opacity: 1 - layer * 0.22,
            }}
          />
        ))}
        <div
          className="absolute inset-0 flex items-center justify-center rounded-[2rem]"
          style={{ transform: "translateZ(14px)" }}
        >
          <div
            className="flex size-24 items-center justify-center rounded-3xl shadow-lg"
            style={{
              background: "linear-gradient(155deg, var(--color-accent-500), var(--color-accent-700))",
              boxShadow: "0 24px 48px -16px rgb(46 107 255 / 0.55)",
            }}
          >
            <BlueprintMark className="size-12 text-white" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
