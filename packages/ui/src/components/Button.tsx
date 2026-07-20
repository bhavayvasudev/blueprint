"use client";

import { Button as HeroButton, type ButtonProps as HeroButtonProps } from "@heroui/react";
import type { ReactNode } from "react";
import { Spinner } from "./Spinner";

/* Variants are the closed set MASTER.md §7/§10 allows. `primary` is the
 * inverted-ink pill with the accent glow — the one CTA per screen and
 * the only element that owns the accent glow (MASTER.md §6). `danger`
 * wears status-failed and is used only behind a confirmation.
 *
 * The classes carry the entire Blueprint look; HeroUI supplies the
 * behavior underneath (React Aria press semantics, keyboard activation,
 * pending state, focus management) per docs/DECISIONS.md — building
 * blocks, never the appearance. */
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

/* The nearest HeroUI semantic per variant — screen readers and the BEM
 * layer see an honest role even though our utilities repaint it. */
const HERO_VARIANT: Record<keyof typeof VARIANTS, HeroButtonProps["variant"]> = {
  primary: "primary",
  accent: "primary",
  ghost: "secondary",
  quiet: "ghost",
  danger: "danger",
};

/* Compact controls take the 6px radius; md/lg are pills (MASTER.md §3). */
const SIZES = {
  sm: "rounded-md px-3 py-1.5 text-xs",
  md: "rounded-full px-5 py-2.5 text-sm",
  lg: "rounded-full px-7 py-3.5 text-sm",
} as const;

const FOCUS_RING =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500";

/* Press compresses and springs back (MASTER.md §8/§9 — physicality);
 * driven by React Aria's data-pressed so keyboard activation compresses
 * too, which the old pointer-only spring never did. */
const PRESS =
  "transition-transform duration-150 ease-out data-[hovered]:-translate-y-0.5 data-[pressed]:translate-y-0 data-[pressed]:scale-[0.965] motion-reduce:transform-none";

export interface ButtonProps
  extends Omit<HeroButtonProps, "variant" | "size" | "isPending" | "isDisabled" | "children"> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Async in flight: disables the button and swaps in a spinner without
   * the label moving (MASTER.md §10 — loading buttons never change
   * width, never stay silently frozen). */
  loading?: boolean;
  /** Kept for compatibility with the native-button API this primitive
   * replaced; maps to React Aria's `isDisabled`. */
  disabled?: boolean;
  children: ReactNode;
}

/** The one button primitive, HeroUI-backed: React Aria owns press,
 * keyboard, focus, and pending semantics; these classes own every pixel.
 * Everything else — labels, confirmation before destructive actions, one
 * primary per screen — is the caller's contract with MASTER.md §10. */
export function Button({
  variant = "ghost",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <HeroButton
      type={type}
      variant={HERO_VARIANT[variant]}
      isDisabled={disabled || loading}
      isPending={loading}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 font-medium disabled:cursor-not-allowed disabled:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 ${PRESS} ${FOCUS_RING} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner size={size === "lg" ? "md" : "sm"} />}
      {children}
    </HeroButton>
  );
}
