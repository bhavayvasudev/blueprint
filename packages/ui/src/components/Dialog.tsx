"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useId, useRef, type ReactNode } from "react";
import { Scrim, useOverlay } from "./overlay";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** The dialog's question or subject — always visible, always the
   * accessible name. */
  title: ReactNode;
  /** One supporting sentence under the title. */
  description?: ReactNode;
  children?: ReactNode;
  /** Actions row, right-aligned. Destructive actions belong here as a
   * `danger` Button, visually separated from the primary (MASTER.md §10). */
  footer?: ReactNode;
  /** `alertdialog` for confirmations before destructive actions. */
  role?: "dialog" | "alertdialog";
}

/** The one modal primitive. Glass-strong over the scrim (text-dense glass
 * rule, MASTER.md §5), panel radius 16px, modal stratum z-50 (§4). It
 * scales in from 0.96 and rises 8px — arriving from the trigger, not
 * teleporting — and exits at ~65% of the enter duration (§8). Escape,
 * scrim click, focus trap, and focus return are handled by `useOverlay`;
 * centered ≥768px, bottom sheet below (§11). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  role = "dialog",
}: DialogProps) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useOverlay(open, onClose, panelRef);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
          <Scrim onClose={onClose} />
          <motion.div
            ref={panelRef}
            role={role}
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0 } }
                : { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.22, ease: "easeIn" } }
            }
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="glass-strong edge-light relative w-full max-w-lg rounded-t-2xl p-8 outline-none md:rounded-2xl"
          >
            <h2
              id={titleId}
              className="text-xl font-semibold text-ink-950 dark:text-ink-50"
            >
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-2 text-sm text-ink-500 dark:text-ink-400">
                {description}
              </p>
            )}
            {children && <div className="mt-6">{children}</div>}
            {footer && (
              <div className="mt-8 flex items-center justify-end gap-3">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
