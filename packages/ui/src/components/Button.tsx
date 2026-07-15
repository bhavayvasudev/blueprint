"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { Spinner } from "./Spinner";

/* Variants are the closed set MASTER.md §7/§10 allows. `primary` is the
 * inverted-ink pill with the accent glow — the one CTA per screen and
 * the only element that owns the accent glow (MASTER.md §6). `danger`
 * wears status-failed and is used only behind a confirmation. */
const VARIANTS = {
  primary:
    "bg-ink-950 text-white shadow-lg shadow-accent-500/25 transition-shadow hover:shadow-xl hover:shadow-accent-500/40 dark:bg-white dark:text-ink-950",
  accent:
    "bg-accent-500 text-white shadow-md shadow-accent-500/20 transition-shadow hover:shadow-lg hover:shadow-accent-500/35 hover:bg-accent-600",
  ghost:
    "glass edge-light text-ink-700 shadow-sm transition-shadow hover:shadow-md hover:text-ink-950 dark:text-ink-300 dark:hover:text-ink-50",
  quiet:
    "text-ink-500 transition-colors hover:text-ink-950 dark:text-ink-400 dark:hover:text-ink-50",
  danger:
    "bg-status-failed text-white shadow-md shadow-status-failed/20 transition-shadow hover:shadow-lg hover:shadow-status-failed/35 hover:bg-status-failed/90",
} as const;

/* Compact controls take the 6px radius; md/lg are pills (MASTER.md §3). */
const SIZES = {
  sm: "rounded-md px-3 py-1.5 text-xs",
  md: "rounded-full px-5 py-2.5 text-sm",
  lg: "rounded-full px-7 py-3.5 text-sm",
} as const;

const FOCUS_RING =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500";

export interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Async in flight: disables the button and swaps in a spinner without
   * the label moving (MASTER.md §10 — loading buttons never change
   * width, never stay silently frozen). */
  loading?: boolean;
  children: ReactNode;
}

/** The one button primitive. Press compresses to 0.97 and springs back
 * (MASTER.md §8/§9 — physicality, the house spring); hover shifts light
 * (shadow/tone), never position. Everything else — labels, confirmation
 * before destructive actions, one primary per screen — is the caller's
 * contract with MASTER.md §10. */
export function Button({
  variant = "ghost",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const reduceMotion = useReducedMotion();
  const isDisabled = disabled || loading;

  return (
    <motion.button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      whileHover={reduceMotion || isDisabled ? undefined : { y: -2, scale: 1.012 }}
      whileTap={reduceMotion || isDisabled ? undefined : { scale: 0.965, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 18, mass: 0.5 }}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 font-medium disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner size={size === "lg" ? "md" : "sm"} />}
      {children}
    </motion.button>
  );
}
