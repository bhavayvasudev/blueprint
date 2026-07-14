"use client";

/* Internal overlay plumbing shared by Dialog, Drawer, and the command
 * palette — not exported from the package. One implementation of the
 * MASTER.md §12 overlay contract: Escape closes, focus moves into the
 * layer and is trapped there, and returns to the trigger on close; the
 * page behind stops scrolling. */

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useOverlay(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Land focus on the first control in the layer (or the layer itself).
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (!firstEl || !lastEl) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === firstEl || active === panelRef.current)) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && active === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose, panelRef]);
}

export interface ScrimProps {
  onClose: () => void;
}

/** The one scrim: ~50% black with a light backdrop blur, so glass layers
 * read against darkness (MASTER.md §5 — blur signals "the background is
 * dismissed", never decoration). Clicking it is the escape route. */
export function Scrim({ onClose }: ScrimProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.22 } }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      onClick={onClose}
      aria-hidden="true"
      className="absolute inset-0 bg-black/50 backdrop-blur-sm"
    />
  );
}
