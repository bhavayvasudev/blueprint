"use client";

import { Badge, type BadgeTone } from "@blueprint/ui";
import { IconChevronDown, IconFile, IconFolder, IconWarning } from "@/components/workspace/icons";
import type { AtlasNode } from "@/lib/atlas-hierarchy";
import type { CardTier } from "@/lib/atlas-layout";

/** The architecture card — what replaced the circle. Every field on it
 * is real: a module's badge is its actual `nodeType` from Stage 3, file
 * and import counts are the same arithmetic the old circles carried in
 * their radius, nothing here is a synthesized category (PRODUCT.md's
 * anti-fabrication stance rules that out for domains/folders too — see
 * `containerLabel`, which states a real rollup count instead of
 * guessing a kind like "API"/"Core").
 *
 * Two separate targets, mirroring `RepositoryExplorer`'s tree row: the
 * card body selects (mirrors the tree, opens the inspector); the
 * chevron button drills — pushes this node onto the breadcrumb and
 * swaps in a freshly laid out layer for its children. Selecting and
 * opening are different intents and were conflated by "zoom until it
 * opens" in the old design; here both are keyboard-reachable on their
 * own control. */

const NODE_TYPE_TONE: Record<string, BadgeTone> = {
  service: "accent",
  api: "accent",
};

function moduleBadge(nodeType: string): { label: string; tone: BadgeTone } {
  return { label: nodeType, tone: NODE_TYPE_TONE[nodeType.toLowerCase()] ?? "neutral" };
}

function containerLabel(node: AtlasNode): string {
  if (node.kind === "domain") {
    return node.moduleCount > 0
      ? `Domain · ${node.moduleCount} ${node.moduleCount === 1 ? "module" : "modules"}`
      : "Domain";
  }
  return "Folder";
}

export interface AtlasNodeCardProps {
  node: AtlasNode;
  tier: CardTier;
  width: number;
  height: number;
  isPeer: boolean;
  isSelected: boolean;
  isKeystone: boolean;
  isHovered: boolean;
  isCore: boolean;
  isNeighbor: boolean;
  isMatched: boolean;
  dim: number;
  drillable: boolean;
  onSelect: () => void;
  onDrill: () => void;
  onHoverChange: (hovering: boolean) => void;
}

export function AtlasNodeCard({
  node,
  tier,
  width,
  height,
  isPeer,
  isSelected,
  isKeystone,
  isHovered,
  isCore,
  isNeighbor,
  isMatched,
  dim,
  drillable,
  onSelect,
  onDrill,
  onHoverChange,
}: AtlasNodeCardProps) {
  const lit = isCore || isHovered;
  const Icon = tier === "file" ? IconFile : IconFolder;
  const badge = tier === "module" && node.module ? moduleBadge(node.module.nodeType) : null;
  const importStats =
    tier === "module" && node.module
      ? `→ ${node.module.dependsOn.length} · ${node.module.dependedOnBy.length} ←`
      : null;

  const ariaLabel = isPeer
    ? `${node.path || node.name} — outside this view, connected by a real import. Activate to open it.`
    : tier === "module" && node.module
      ? `${node.path}: module, ${node.module.fileCount} files, imports ${node.module.dependsOn.length}, imported by ${node.module.dependedOnBy.length}`
      : tier === "file"
        ? `${node.path} — one file`
        : `${node.path}: ${containerLabel(node)}, ${node.fileCount} files`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isPeer ? undefined : isSelected}
      aria-label={ariaLabel}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      style={{ width, height, opacity: dim }}
      className={`group flex select-none flex-col gap-1 rounded-xl border px-2.5 py-2 outline-none transition-[border-color,box-shadow,background-color] duration-200 cursor-pointer ${
        isPeer
          ? "border-dashed border-ink-950/15 bg-ink-950/[0.02] hover:border-ink-950/30 dark:border-white/15 dark:bg-white/[0.02] dark:hover:border-white/30"
          : "bg-white/95 dark:bg-ink-800/95"
      } ${
        !isPeer && lit
          ? "border-accent-500 shadow-[0_0_0_1px_var(--color-accent-500),0_8px_24px_-8px_rgb(46_107_255/0.45)]"
          : !isPeer && isNeighbor
            ? "border-accent-400/60"
            : !isPeer
              ? "border-ink-950/10 hover:border-ink-950/25 dark:border-white/10 dark:hover:border-white/25"
              : ""
      } ${isSelected ? "ring-2 ring-accent-500/70 ring-offset-1 ring-offset-[var(--background)]" : ""} ${isMatched ? "outline outline-2 outline-dashed outline-accent-500/70 outline-offset-2" : ""} focus-visible:border-accent-500 focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]`}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-1.5">
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${
            isKeystone ? "text-accent-500" : isPeer ? "text-ink-400 dark:text-ink-500" : "text-ink-400 dark:text-ink-500"
          }`}
        />
        <span
          className={`min-w-0 truncate font-mono text-[11px] ${
            isPeer
              ? "text-ink-500 dark:text-ink-400"
              : lit
                ? "font-semibold text-ink-950 dark:text-ink-50"
                : "font-medium text-ink-800 dark:text-ink-100"
          }`}
        >
          {node.name}
        </span>
        {node.module?.inCycle ? (
          <IconWarning
            className="h-3 w-3 shrink-0 text-status-indexing-deep dark:text-status-indexing"
            aria-label="Part of a circular dependency"
          />
        ) : null}
        {drillable ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDrill();
            }}
            aria-label={`Open ${node.name}`}
            className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-ink-400 opacity-0 transition-opacity hover:bg-ink-950/8 hover:text-ink-800 focus-visible:opacity-100 group-hover:opacity-100 dark:text-ink-500 dark:hover:bg-white/10 dark:hover:text-ink-100"
          >
            <IconChevronDown className="h-3 w-3 -rotate-90" />
          </button>
        ) : null}
      </div>

      {badge ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
      ) : tier === "container" && !isPeer ? (
        <span className="shrink-0 truncate text-[10px] text-ink-500 dark:text-ink-400">
          {containerLabel(node)}
        </span>
      ) : null}

      {!isPeer && tier !== "file" ? (
        <div className="mt-auto flex shrink-0 items-center justify-between gap-2 font-mono text-[10px] text-ink-500 dark:text-ink-400">
          <span>
            {node.fileCount.toLocaleString()} {node.fileCount === 1 ? "file" : "files"}
          </span>
          {importStats ? <span className="shrink-0">{importStats}</span> : null}
        </div>
      ) : isPeer && node.path && node.path !== node.name ? (
        <span className="shrink-0 truncate text-[10px] text-ink-400 dark:text-ink-500">
          {node.path}
        </span>
      ) : null}
    </div>
  );
}
