"use client";

import { Skeleton as HeroSkeleton } from "@heroui/react";

const VARIANTS = {
  /** One line of body text. */
  line: "h-4 rounded-md",
  /** A heading-weight line. */
  title: "h-6 rounded-md",
  /** A panel-shaped region (charts, the Atlas stage, media). */
  block: "rounded-2xl",
  /** An avatar / icon slot. */
  circle: "rounded-full",
} as const;

export interface SkeletonProps {
  variant?: keyof typeof VARIANTS;
  className?: string;
}

/** Loading placeholder shaped like the content it stands in for
 * (MASTER.md §10: document-shaped skeletons after 300ms, never blocking
 * spinners). HeroUI's Skeleton carries the shimmer (the one class of
 * animation allowed to loop, and it honors reduced motion); the ink
 * tones and shapes stay Blueprint's. Always `aria-hidden`; the region's
 * loading state is announced once by its container, not per bone. */
export function Skeleton({ variant = "line", className = "" }: SkeletonProps) {
  return (
    <HeroSkeleton
      aria-hidden="true"
      className={`relative overflow-hidden bg-ink-100 dark:bg-ink-800 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export interface SkeletonTextProps {
  /** Number of prose lines to suggest. */
  lines?: number;
  className?: string;
}

/** A paragraph-shaped skeleton — the register of the Briefing is prose,
 * so its loading state reads as a document settling in, not a widget
 * grid flashing (PRODUCT.md: "reads like a document, not a dashboard"). */
export function SkeletonText({ lines = 3, className = "" }: SkeletonTextProps) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          variant="line"
          className={index === lines - 1 ? "w-3/5" : "w-full"}
        />
      ))}
    </div>
  );
}
