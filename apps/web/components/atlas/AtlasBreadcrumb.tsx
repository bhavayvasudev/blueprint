"use client";

import { IconArrowRight } from "@/components/workspace/icons";
import type { AtlasNode } from "@/lib/atlas-hierarchy";

/** Primary wayfinding for the drill-down model — replaces "where am I
 * in the zoom" with an explicit, always-visible path. Every segment is
 * a real ancestor (`AtlasGraph` builds this from `ancestorChain`), so
 * the breadcrumb is itself a second, honest reading of the same
 * containment the cards draw. */
export function AtlasBreadcrumb({
  trail,
  onJump,
}: {
  /** The open path, root first. Empty means the repository root layer. */
  trail: AtlasNode[];
  onJump: (containerId: string | null) => void;
}) {
  return (
    <nav
      aria-label="Atlas location"
      className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap font-mono text-xs"
    >
      <button
        type="button"
        onClick={() => onJump(null)}
        className={`shrink-0 rounded-md px-1.5 py-0.5 transition-colors ${
          trail.length === 0
            ? "font-medium text-ink-950 dark:text-ink-50"
            : "text-ink-500 hover:bg-ink-950/6 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-white/8 dark:hover:text-ink-100"
        }`}
      >
        Repository
      </button>
      {trail.map((node, index) => {
        const isLast = index === trail.length - 1;
        return (
          <span key={node.id} className="flex shrink-0 items-center gap-1">
            <IconArrowRight className="h-3 w-3 shrink-0 text-ink-300 dark:text-ink-600" />
            <button
              type="button"
              onClick={() => onJump(node.id)}
              aria-current={isLast ? "location" : undefined}
              className={`rounded-md px-1.5 py-0.5 transition-colors ${
                isLast
                  ? "font-medium text-ink-950 dark:text-ink-50"
                  : "text-ink-500 hover:bg-ink-950/6 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-white/8 dark:hover:text-ink-100"
              }`}
            >
              {node.name}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
