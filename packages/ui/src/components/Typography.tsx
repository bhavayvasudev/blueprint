import type { ElementType, ReactNode } from "react";

const HEADING_STYLES = {
  1: "text-3xl font-semibold tracking-tight",
  2: "text-2xl font-semibold tracking-tight",
  3: "text-xl font-semibold",
  4: "text-lg font-medium",
} as const;

export interface HeadingProps {
  level: keyof typeof HEADING_STYLES;
  children: ReactNode;
  className?: string;
}

/** The one heading primitive — every document-style page title/section
 * title uses this rather than a raw `<h1>`/`<h2>` with ad hoc size
 * classes (RULES.md §18's "one type scale"). */
export function Heading({ level, children, className = "" }: HeadingProps) {
  const Tag = `h${level}` as ElementType;
  return (
    <Tag className={`text-ink-950 dark:text-ink-50 ${HEADING_STYLES[level]} ${className}`}>
      {children}
    </Tag>
  );
}

const TEXT_SIZES = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
} as const;

const TEXT_TONES = {
  primary: "text-ink-900 dark:text-ink-100",
  secondary: "text-ink-500 dark:text-ink-400",
  accent: "text-accent-600 dark:text-accent-400",
} as const;

export interface TextProps {
  size?: keyof typeof TEXT_SIZES;
  tone?: keyof typeof TEXT_TONES;
  mono?: boolean;
  as?: "p" | "span" | "div";
  children: ReactNode;
  className?: string;
}

/** The one body-text primitive — size/tone are closed unions (RULES.md
 * §18: never an arbitrary text size or color reached for inline). */
export function Text({
  size = "base",
  tone = "primary",
  mono = false,
  as: Tag = "p",
  children,
  className = "",
}: TextProps) {
  return (
    <Tag
      className={`${TEXT_SIZES[size]} ${TEXT_TONES[tone]} ${mono ? "font-mono" : ""} ${className}`}
    >
      {children}
    </Tag>
  );
}
