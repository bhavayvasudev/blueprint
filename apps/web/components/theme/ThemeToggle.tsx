"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconMoon, IconSun } from "@/components/workspace/icons";
import { useTheme } from "./ThemeProvider";

const VARIANTS = {
  /** Floats on its own — used where it isn't already inside another
   * glass surface (the landing page header). */
  floating: "glass edge-light",
  /** Sits flush inside a shared pill (the workspace top bar) — no
   * nested glass, just the same hover wash as its sibling buttons. */
  flat: "hover:bg-ink-950/5 dark:hover:bg-white/8",
} as const;

/** The light/dark switch — a physical toggle, not a checkbox: the glyph
 * rotates in like a celestial body swapping into the sky. */
export function ThemeToggle({
  className = "",
  variant = "floating",
}: {
  className?: string;
  variant?: keyof typeof VARIANTS;
}) {
  const { theme, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={`relative flex size-9 items-center justify-center overflow-hidden rounded-full text-ink-600 transition-colors hover:text-ink-950 dark:text-ink-300 dark:hover:text-ink-50 ${VARIANTS[variant]} ${className}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={reduceMotion ? false : { rotate: -90, opacity: 0, scale: 0.5 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={reduceMotion ? undefined : { rotate: 90, opacity: 0, scale: 0.5 }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
          className="flex"
        >
          {theme === "dark" ? <IconMoon className="size-4.5" /> : <IconSun className="size-4.5" />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
