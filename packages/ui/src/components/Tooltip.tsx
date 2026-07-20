"use client";

import { Tooltip as HeroTooltip } from "@heroui/react";
import type { ReactNode } from "react";

export interface TooltipProps {
  /** The label — a few words naming the control, never lore. Controls
   * with visible text don't need one (MASTER.md §12). */
  content: ReactNode;
  /** Placement relative to the trigger. */
  placement?: "top" | "bottom" | "left" | "right";
  /** Hover/focus delay in ms; the theme default answers quickly. */
  delay?: number;
  /** The trigger — must be focusable (a Button, an icon control). */
  children: ReactNode;
}

/** The one tooltip primitive — HeroUI's Tooltip (hover *and* focus
 * triggered, correctly described, touch-safe) dressed as a small glass
 * chip. New with the HeroUI adoption: icon-only controls in the chrome
 * finally get a named hover affordance instead of relying on aria-label
 * alone. */
export function Tooltip({ content, placement = "top", delay, children }: TooltipProps) {
  return (
    <HeroTooltip delay={delay}>
      {children}
      <HeroTooltip.Content
        placement={placement}
        className="glass-strong edge-light rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-950 shadow-md dark:text-ink-50"
      >
        {content}
      </HeroTooltip.Content>
    </HeroTooltip>
  );
}
