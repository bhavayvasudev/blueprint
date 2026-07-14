"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useId, useRef, type ReactNode } from "react";
import { Scrim, useOverlay } from "./overlay";

const SIDES = {
  right: {
    container: "justify-end",
    panel: "h-full w-full max-w-md rounded-l-2xl",
    hidden: { x: "100%", y: 0 },
  },
  bottom: {
    container: "items-end",
    panel: "max-h-[85dvh] w-full rounded-t-2xl",
    hidden: { x: 0, y: "100%" },
  },
} as const;

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the layer — e.g. "Evidence". */
  title: ReactNode;
  children: ReactNode;
  side?: keyof typeof SIDES;
}

/** The overlay-rail primitive (z-40, MASTER.md §4) — the evidence rail's
 * chrome: from any claim, reasoning and source open beside your place
 * instead of replacing it (UX strategy: the rail is cross-cutting).
 * Slides from its edge (overlays animate from their trigger's direction,
 * §8), exits faster than it enters, and inherits the full overlay
 * contract (Escape / scrim / focus) from `useOverlay`. On small screens
 * it becomes a bottom sheet (§11). */
export function Drawer({ open, onClose, title, children, side = "right" }: DrawerProps) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const config = SIDES[side];

  useOverlay(open, onClose, panelRef);

  return (
    <AnimatePresence>
      {open && (
        <div className={`fixed inset-0 z-40 flex ${config.container}`}>
          <Scrim onClose={onClose} />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reduceMotion ? false : { ...config.hidden, opacity: 0.5 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0 } }
                : { ...config.hidden, opacity: 0.5, transition: { duration: 0.22, ease: "easeIn" } }
            }
            transition={{ duration: 0.35, ease: "easeOut" }}
            className={`glass-strong edge-light relative flex flex-col overflow-hidden outline-none ${config.panel}`}
          >
            <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-4">
              <h2 id={titleId} className="text-lg font-medium text-ink-950 dark:text-ink-50">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex size-8 cursor-pointer items-center justify-center rounded-full text-ink-500 outline-none transition-colors hover:text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:text-ink-400 dark:hover:text-ink-50"
              >
                <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
