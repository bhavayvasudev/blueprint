"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export interface CountUpProps {
  /** The real, final number — never animated toward a fabricated or
   * rounded-up value; the number itself always comes from the caller. */
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  formatter?: (n: number) => string;
}

/** Counts up from zero once it scrolls into view — a worked-example stat
 * arriving on screen reads as measured, not printed. Skips straight to
 * the final value under `prefers-reduced-motion`, and only ever
 * animates toward the real number the caller already computed. */
export function CountUp({ value, suffix = "", prefix = "", duration = 1.2, formatter }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10% 0px -10% 0px" });
  const reduceMotion = useReducedMotion();
  const [animatedValue, setAnimatedValue] = useState(0);
  const format = formatter ?? ((n: number) => Math.round(n).toLocaleString());
  const display = reduceMotion ? value : animatedValue;

  useEffect(() => {
    if (!isInView || reduceMotion) return;
    const controls = animate(0, value, {
      duration,
      ease: "easeOut",
      onUpdate: (latest) => setAnimatedValue(latest),
    });
    return () => controls.stop();
  }, [isInView, reduceMotion, value, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {format(display)}
      {suffix}
    </span>
  );
}
