"use client";

import { Separator } from "@heroui/react";

/** The one rule between regions — HeroUI's Separator (correct
 * `role="separator"` semantics) on Blueprint's ink hairline. */
export function Divider({ className = "" }: { className?: string }) {
  return <Separator className={`border-t border-ink-200 bg-transparent dark:border-ink-800 ${className}`} />;
}
