"use client";

import type { ReactNode } from "react";
import { useStatsForNerds } from "@/lib/use-stats-for-nerds";

/** Gates server-rendered children behind the "Stats for nerds" toggle —
 * the technical inventory (raw graph internals, method rows, per-module
 * file tables) the redesigned Atlas no longer leads with. Off by
 * default; the children themselves stay ordinary server-rendered JSX,
 * this component only decides whether to mount them. */
export function StatsForNerdsSection({ children }: { children: ReactNode }) {
  const [enabled] = useStatsForNerds();
  if (!enabled) return null;
  return <>{children}</>;
}
