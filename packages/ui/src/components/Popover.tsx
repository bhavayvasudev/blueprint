"use client";

/* The anchored-overlay primitive — repo switcher, notifications,
 * profile menu, and any future menu/combobox all sit on this. It is a
 * sibling to `overlay.tsx`, not a replacement: Dialog/Drawer/
 * CommandPalette are full-screen layers behind a Scrim and correctly
 * lock page scroll; a popover anchored to a topbar icon must not lock
 * scroll, must position itself against its trigger, and must let a
 * click elsewhere in the topbar pass through to switch menus rather
 * than requiring a first click to dismiss. */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function usePopoverPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  align: "start" | "end",
  gap: number,
) {
  const [style, setStyle] = useState<{ top: number; left?: number; right?: number } | null>(null);

  const recompute = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    if (align === "end") {
      setStyle({ top: rect.bottom + gap, right: Math.max(margin, window.innerWidth - rect.right) });
    } else {
      setStyle({ top: rect.bottom + gap, left: Math.max(margin, rect.left) });
    }
  }, [triggerRef, align, gap]);

  useLayoutEffect(() => {
    if (!open) return;
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [open, recompute]);

  return style;
}

/** Escape closes, Tab is trapped inside the panel while open, and focus
 * returns to whatever was focused (normally the trigger) on close — the
 * same contract as `useOverlay`, minus the body-scroll lock and the
 * full-screen Scrim, plus a pointerdown-outside listener that ignores
 * the trigger itself (so clicking the trigger toggles, never double
 * fires open+close). */
function useAnchoredOverlay(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
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

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose, panelRef, triggerRef]);
}

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** The button the popover is anchored to — its own focus-return and
   * outside-click exclusion target. */
  triggerRef: RefObject<HTMLElement | null>;
  /** Which edge of the trigger the panel's own edge lines up with. */
  align?: "start" | "end";
  /** Panel width in px; content scrolls internally past `maxHeight`. */
  width?: number;
  maxHeight?: number;
  className?: string;
  "aria-label": string;
  children: ReactNode;
}

/** The one anchored-menu shell: glass panel, positioned below its
 * trigger, same enter motion as Dialog/CommandPalette (scale + rise) so
 * every overlay in the workspace arrives the same way. */
export function Popover({
  open,
  onClose,
  triggerRef,
  align = "end",
  width = 288,
  maxHeight = 360,
  className = "",
  children,
  ...rest
}: PopoverProps) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const position = usePopoverPosition(open, triggerRef, align, 10);

  useAnchoredOverlay(open, onClose, panelRef, triggerRef);

  return (
    <AnimatePresence>
      {open && position && (
        <motion.div
          ref={panelRef}
          role="menu"
          aria-label={rest["aria-label"]}
          tabIndex={-1}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.94, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={
            reduceMotion
              ? { opacity: 0, transition: { duration: 0 } }
              : { opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.14, ease: "easeIn" } }
          }
          transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            right: position.right,
            width,
            maxHeight,
            transformOrigin: align === "end" ? "top right" : "top left",
          }}
          className={`glass-strong edge-light z-40 flex flex-col overflow-hidden rounded-2xl outline-none ${className}`}
        >
          <div className="overflow-y-auto">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface PopoverItemProps {
  icon?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  onSelect?: () => void;
  href?: string;
  tone?: "default" | "danger";
  disabled?: boolean;
}

/** One row inside a Popover menu — the shared visual grammar for repo
 * switcher entries, profile menu actions, and notification rows alike. */
export function PopoverItem({
  icon,
  children,
  hint,
  onSelect,
  href,
  tone = "default",
  disabled = false,
}: PopoverItemProps) {
  const toneClass =
    tone === "danger"
      ? "text-status-failed-deep hover:bg-status-failed/10 dark:text-status-failed"
      : "text-ink-700 hover:bg-ink-950/5 dark:text-ink-300 dark:hover:bg-white/8";
  const className = `flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`;

  const inner = (
    <>
      {icon && (
        <span className="shrink-0 text-ink-400 [&>*]:size-4 dark:text-ink-500" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-xs text-ink-400 dark:text-ink-500">{hint}</span>}
    </>
  );

  if (href) {
    return (
      <a role="menuitem" href={href} onClick={onSelect} className={className}>
        {inner}
      </a>
    );
  }

  return (
    <button role="menuitem" type="button" disabled={disabled} onClick={onSelect} className={className}>
      {inner}
    </button>
  );
}

export function PopoverSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 pb-1.5 pt-3 text-xs font-medium text-ink-500 dark:text-ink-400">{children}</p>
  );
}

export function PopoverDivider() {
  return <div className="my-1.5 h-px bg-ink-950/6 dark:bg-white/8" />;
}
