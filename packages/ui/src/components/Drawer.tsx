"use client";

import { CloseButton, Drawer as HeroDrawer } from "@heroui/react";
import type { ReactNode } from "react";

const SIDES = {
  right: {
    placement: "right" as const,
    panel: "h-full w-full max-w-md rounded-l-2xl rounded-r-none",
  },
  bottom: {
    placement: "bottom" as const,
    panel: "max-h-[85dvh] w-full rounded-t-2xl rounded-b-none",
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

/** The overlay-rail primitive (z-40, MASTER.md §4), HeroUI-backed —
 * the evidence rail's chrome: from any claim, reasoning and source open
 * beside your place instead of replacing it. React Aria owns the slide
 * choreography from the panel's own edge (§8), Escape/scrim dismissal,
 * the focus trap, and focus return. On small screens callers pass
 * `side="bottom"` for the sheet form (§11). */
export function Drawer({ open, onClose, title, children, side = "right" }: DrawerProps) {
  const config = SIDES[side];

  return (
    <HeroDrawer.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      className="z-40 bg-black/50 backdrop-blur-sm"
    >
      <HeroDrawer.Content
        placement={config.placement}
        className={`glass-strong edge-light flex flex-col overflow-hidden border-0 outline-none ${config.panel}`}
      >
        <HeroDrawer.Dialog className="flex min-h-0 flex-1 flex-col p-0 outline-none">
          <HeroDrawer.Header className="flex items-center justify-between gap-4 px-6 pt-6 pb-4">
            <HeroDrawer.Heading className="text-lg font-medium text-ink-950 dark:text-ink-50">
              {title}
            </HeroDrawer.Heading>
            <CloseButton
              slot="close"
              aria-label="Close"
              className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-transparent text-ink-500 outline-none transition-colors hover:bg-transparent hover:text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:text-ink-400 dark:hover:text-ink-50"
            />
          </HeroDrawer.Header>
          <HeroDrawer.Body className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {children}
          </HeroDrawer.Body>
        </HeroDrawer.Dialog>
      </HeroDrawer.Content>
    </HeroDrawer.Backdrop>
  );
}
