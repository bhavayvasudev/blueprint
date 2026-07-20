"use client";

/* The anchored-overlay primitive — repo switcher, notifications, profile
 * menu, and card action menus all sit on this. HeroUI's `Popover`
 * (react-aria-components underneath) owns placement, flipping, focus
 * trap, outside-click, and Escape-to-close; these classes own the
 * Blueprint glass look on top (RULES.md §18 — HeroUI provides behavior,
 * Blueprint keeps the appearance).
 *
 * The trigger is an arbitrary custom element (a `motion.button` with its
 * own hover/tap spring), not HeroUI's own `<Button>`, so it can't
 * register itself as a press target on its own — `Pressable` is
 * react-aria's documented answer for exactly this: it clones the press
 * handlers and ref directly onto its single child with no wrapper DOM
 * node, so the real `<button>` stays the only element in the tab order. */
import { Popover as HeroPopover } from "@heroui/react";
import { Pressable } from "react-aria-components";
import type { DOMAttributes, ReactElement, ReactNode } from "react";

type Align = "start" | "center" | "end";

const PLACEMENT: Record<Align, "bottom" | "bottom start" | "bottom end"> = {
  start: "bottom start",
  center: "bottom",
  end: "bottom end",
};

export interface PopoverProps {
  /** The trigger — any single focusable custom element. Rendered as-is;
   * open state and press handling are wired on via `Pressable`. */
  trigger: ReactElement;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Which edge of the trigger the panel's own edge lines up with. */
  align?: Align;
  /** Panel width in px; content scrolls internally past `maxHeight`. */
  width?: number;
  maxHeight?: number;
  className?: string;
  "aria-label": string;
  children: ReactNode;
}

/** The one anchored-menu shell — every anchored menu in the workspace
 * renders through this so they open, place, and reflow identically. */
export function Popover({
  trigger,
  isOpen,
  onOpenChange,
  align = "end",
  width = 288,
  maxHeight = 360,
  className = "",
  children,
  ...rest
}: PopoverProps) {
  return (
    <HeroPopover isOpen={isOpen} onOpenChange={onOpenChange}>
      {/* `Pressable`'s type only accepts a native-tag element (its cloneElement
       * works fine with any component that forwards ref + spreads props, which
       * `motion.button` does — the constraint is stricter than the runtime). */}
      <Pressable>{trigger as ReactElement<DOMAttributes<HTMLElement>, string>}</Pressable>
      <HeroPopover.Content
        placement={PLACEMENT[align]}
        offset={10}
        className={`glass-strong edge-light z-40 overflow-hidden rounded-2xl p-0 shadow-none outline-none ${className}`}
        style={{ width, maxWidth: "calc(100vw - 1.5rem)" }}
      >
        <HeroPopover.Dialog
          aria-label={rest["aria-label"]}
          className="flex flex-col overflow-y-auto p-0 outline-none"
          style={{ maxHeight }}
        >
          {children}
        </HeroPopover.Dialog>
      </HeroPopover.Content>
    </HeroPopover>
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

/** One row inside a Popover — the shared visual grammar for repo
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
      <a href={href} onClick={onSelect} className={className}>
        {inner}
      </a>
    );
  }

  return (
    <button type="button" disabled={disabled} onClick={onSelect} className={className}>
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
