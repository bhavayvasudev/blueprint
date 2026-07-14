"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import { Badge } from "@blueprint/ui";
import { ModuleName } from "@/components/study/Prose";
import type { ModuleFacts } from "@/lib/insights";

/** The Atlas — the structural model as an orbital constellation. The
 * layout is deterministic, not force-directed: the keystone module
 * holds the center, and every other module sits on a ring at its real
 * graph distance from it, so the picture is the architecture (distance
 * from center = distance from the load-bearing wall), stable across
 * every visit, and never jitters for spectacle. Selecting a module
 * opens what the architect knows about it; the module index below the
 * canvas is the same information as text (RULES.md §16). */

const VIEW_W = 880;
const VIEW_H = 600;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;

interface PlacedNode extends ModuleFacts {
  x: number;
  y: number;
  r: number;
}

/** Orbits are ellipses, not circles — the canvas is wide, and a
 * circular layout capped by its height strands most of the stage. */
const ORBIT_RX = CX - 150;
const ORBIT_RY = CY - 85;

function orbitScale(ring: number, maxRing: number): number {
  return ring === 0 ? 0 : 0.55 + 0.45 * (ring / maxRing);
}

/** Deterministic radial jitter — alternating members sit slightly
 * inside/outside their orbit so a ring reads as a constellation, not a
 * stiff circle. Same input, same sky, every visit. */
function orbitJitter(index: number): number {
  return index % 2 === 0 ? 0.9 : 1.07;
}

function placeModules(modules: ModuleFacts[]): Map<string, PlacedNode> {
  const placed = new Map<string, PlacedNode>();
  const maxRing = Math.max(1, ...modules.map((m) => m.ring));
  const byRing = new Map<number, ModuleFacts[]>();
  for (const m of modules) {
    byRing.set(m.ring, [...(byRing.get(m.ring) ?? []), m]);
  }
  for (const [ring, members] of byRing) {
    // Stable order within a ring — alphabetical, so the sky never rearranges.
    const sorted = [...members].sort((a, b) => a.label.localeCompare(b.label));
    const scale = orbitScale(ring, maxRing);
    sorted.forEach((m, i) => {
      const angle = -Math.PI / 2 + ((i + 0.5) / sorted.length) * Math.PI * 2 + ring * 0.45;
      const nodeR = Math.min(30, 15 + Math.sqrt(m.fileCount) * 1.7) + (m.ring === 0 ? 4 : 0);
      const jitter = orbitJitter(i);
      placed.set(m.id, {
        ...m,
        x: ring === 0 ? CX : CX + Math.cos(angle) * ORBIT_RX * scale * jitter,
        y: ring === 0 ? CY : CY + Math.sin(angle) * ORBIT_RY * scale * jitter,
        r: nodeR,
      });
    });
  }
  return placed;
}

/** A gently bowed path between two nodes, trimmed to their rims so the
 * arrowhead lands on the surface, not the center. */
function edgePath(a: PlacedNode, b: PlacedNode): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const sx = a.x + ux * (a.r + 3);
  const sy = a.y + uy * (a.r + 3);
  const ex = b.x - ux * (b.r + 9);
  const ey = b.y - uy * (b.r + 9);
  // Perpendicular bow — 8% of the span, always the same side, so
  // opposing edges in a cycle read as two distinct strands.
  const mx = (sx + ex) / 2 - uy * len * 0.08;
  const my = (sy + ey) / 2 + ux * len * 0.08;
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

function roleSentence(m: ModuleFacts, keystoneId: string | null): string {
  if (m.id === keystoneId)
    return "The load-bearing wall — more modules import this than anything else in the system.";
  if (m.inCycle)
    return "Entangled in a circular dependency — it cannot change independently of its partners.";
  if (m.dependsOn.length === 0 && m.dependedOnBy.length === 0)
    return "No import touches this boundary in either direction — decoupled, or disconnected.";
  if (m.dependedOnBy.length === 0)
    return "Nothing imports this module — it consumes the system without being leaned on.";
  if (m.dependsOn.length === 0)
    return "This module imports nothing — a foundation others build on.";
  return keystoneId
    ? `${m.ring === 1 ? "One step" : `${m.ring} steps`} from the keystone; it both carries and is carried.`
    : "It both carries and is carried.";
}

export function AtlasGraph({
  modules,
  keystoneId,
  initialFocusId,
}: {
  modules: ModuleFacts[];
  keystoneId: string | null;
  initialFocusId: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const placed = useMemo(() => placeModules(modules), [modules]);
  const validFocus =
    initialFocusId && placed.has(initialFocusId) ? initialFocusId : (keystoneId ?? modules[0]?.id ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(validFocus);
  // Keyboard-focus ring, drawn in SVG — a CSS outline on a <circle>
  // traces the bounding box, which reads as a broken rectangle.
  const [focusVisibleId, setFocusVisibleId] = useState<string | null>(null);
  const selected = selectedId ? (placed.get(selectedId) ?? null) : null;

  const edges = useMemo(() => {
    const list: { key: string; from: PlacedNode; to: PlacedNode }[] = [];
    for (const m of modules) {
      const from = placed.get(m.id);
      if (!from) continue;
      for (const dep of m.dependsOn) {
        const to = placed.get(dep.id);
        if (to) list.push({ key: `${m.id}->${dep.id}`, from, to });
      }
    }
    return list;
  }, [modules, placed]);

  if (modules.length === 0) return null;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="glass edge-light overflow-hidden rounded-3xl">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block h-auto w-full"
          role="group"
          aria-label={`Module constellation: ${modules.length} modules. Select a module to read what the architect knows about it.`}
        >
          <defs>
            <radialGradient id="atlas-halo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-aurora-violet)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-aurora-violet)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Orbit guides — the rings modules actually sit on. */}
          {[...new Set(modules.map((m) => m.ring))]
            .filter((ring) => ring > 0)
            .map((ring) => {
              const maxRing = Math.max(1, ...modules.map((m) => m.ring));
              const scale = orbitScale(ring, maxRing);
              return (
                <ellipse
                  key={ring}
                  cx={CX}
                  cy={CY}
                  rx={ORBIT_RX * scale}
                  ry={ORBIT_RY * scale}
                  fill="none"
                  className="stroke-ink-950/5 dark:stroke-white/5"
                  strokeDasharray="2 7"
                />
              );
            })}

          {keystoneId && placed.get(keystoneId) ? (
            <circle
              cx={placed.get(keystoneId)!.x}
              cy={placed.get(keystoneId)!.y}
              r={placed.get(keystoneId)!.r * 3.1}
              fill="url(#atlas-halo)"
            />
          ) : null}

          {/* Import edges. Direction reads from the arrowhead; selection lights the touched strands. */}
          {edges.map(({ key, from, to }) => {
            const touches = selectedId !== null && (from.id === selectedId || to.id === selectedId);
            const dimmed = selectedId !== null && !touches;
            return (
              <g key={key}>
                <motion.path
                  d={edgePath(from, to)}
                  fill="none"
                  strokeWidth={touches ? 1.8 : 1.2}
                  className={
                    touches
                      ? "stroke-accent-500"
                      : "stroke-ink-950/20 dark:stroke-white/20"
                  }
                  initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: dimmed ? 0.25 : 1 }}
                  transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
                />
                {/* Arrowhead at the target rim, oriented along the final segment. */}
                <ArrowHead from={from} to={to} active={touches} dimmed={dimmed} />
              </g>
            );
          })}

          {/* Modules. */}
          {[...placed.values()].map((node, index) => {
            const isSelected = node.id === selectedId;
            const isKeystone = node.id === keystoneId;
            return (
              <motion.g
                key={node.id}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.5,
                  delay: reduceMotion ? 0 : 0.1 + node.ring * 0.12 + index * 0.02,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{ transformOrigin: `${node.x}px ${node.y}px` }}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  aria-label={`${node.label}: ${node.fileCount} files, imports ${node.dependsOn.length}, imported by ${node.dependedOnBy.length}`}
                  onClick={() => setSelectedId(node.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(node.id);
                    }
                  }}
                  onFocus={(event) => {
                    if (event.currentTarget.matches(":focus-visible")) {
                      setFocusVisibleId(node.id);
                    }
                  }}
                  onBlur={() => setFocusVisibleId((id) => (id === node.id ? null : id))}
                  className={`cursor-pointer outline-none transition-[stroke,filter] duration-200 ${
                    isSelected
                      ? "fill-white stroke-accent-500 drop-shadow-[0_0_14px_rgb(106_110_242/0.45)] dark:fill-ink-800"
                      : "fill-white/90 stroke-ink-950/15 hover:stroke-ink-950/40 dark:fill-ink-800/90 dark:stroke-white/15 dark:hover:stroke-white/40"
                  }`}
                  strokeWidth={isSelected ? 2 : 1.25}
                />
                {focusVisibleId === node.id ? (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r + 5}
                    fill="none"
                    className="pointer-events-none stroke-accent-500"
                    strokeWidth={2}
                  />
                ) : null}
                {isKeystone ? (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r + 6}
                    fill="none"
                    className="pointer-events-none stroke-accent-400/50"
                    strokeWidth={1}
                    strokeDasharray="3 5"
                  />
                ) : null}
                <text
                  x={node.x}
                  y={node.y + node.r + 16}
                  textAnchor="middle"
                  className={`pointer-events-none font-mono text-[11px] ${
                    isSelected
                      ? "fill-ink-950 font-semibold dark:fill-ink-50"
                      : "fill-ink-600 dark:fill-ink-300"
                  }`}
                  stroke="var(--background)"
                  strokeWidth={3.5}
                  style={{ paintOrder: "stroke" }}
                >
                  {node.label}
                </text>
                <text
                  x={node.x}
                  y={node.y + 4}
                  textAnchor="middle"
                  className="pointer-events-none fill-ink-500 font-mono text-[10px] dark:fill-ink-400"
                >
                  {node.fileCount}
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>

      {/* What the architect knows about the selected module. */}
      {selected ? (
        <aside
          aria-live="polite"
          className="glass-strong edge-light flex flex-col gap-5 rounded-3xl p-6 xl:sticky xl:top-24"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 font-mono text-lg font-semibold text-ink-950 dark:text-ink-50">
              <ModuleName label={selected.label} />
            </h3>
            <Badge tone={selected.nodeType === "service" ? "accent" : "neutral"}>
              {selected.nodeType}
            </Badge>
          </div>

          <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            {roleSentence(selected, keystoneId)}
          </p>

          <dl className="flex flex-col gap-4 border-t border-ink-950/8 pt-4 text-sm dark:border-white/8">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-500 dark:text-ink-400">Files behind the boundary</dt>
              <dd className="font-mono text-ink-950 dark:text-ink-50">{selected.fileCount}</dd>
            </div>
            <NeighborList
              label="Imports"
              empty="nothing at module level"
              neighbors={selected.dependsOn}
              onSelect={setSelectedId}
            />
            <NeighborList
              label="Imported by"
              empty="no module leans on it"
              neighbors={selected.dependedOnBy}
              onSelect={setSelectedId}
            />
          </dl>
        </aside>
      ) : null}
    </div>
  );
}

function ArrowHead({
  from,
  to,
  active,
  dimmed,
}: {
  from: PlacedNode;
  to: PlacedNode;
  active: boolean;
  dimmed: boolean;
}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const tipX = to.x - ux * (to.r + 3);
  const tipY = to.y - uy * (to.r + 3);
  const baseX = tipX - ux * 7;
  const baseY = tipY - uy * 7;
  const points = `${tipX},${tipY} ${baseX - uy * 3.2},${baseY + ux * 3.2} ${baseX + uy * 3.2},${baseY - ux * 3.2}`;
  return (
    <polygon
      points={points}
      className={
        active ? "fill-accent-500" : "fill-ink-950/25 dark:fill-white/25"
      }
      opacity={dimmed ? 0.25 : 1}
    />
  );
}

function NeighborList({
  label,
  empty,
  neighbors,
  onSelect,
}: {
  label: string;
  empty: string;
  neighbors: { id: string; label: string }[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <dt className="text-ink-500 dark:text-ink-400">
        {label}
        <span className="ml-1.5 font-mono text-xs text-ink-400 dark:text-ink-500">
          {neighbors.length}
        </span>
      </dt>
      <dd className="flex flex-wrap gap-1.5">
        {neighbors.length === 0 ? (
          <span className="text-xs text-ink-400 dark:text-ink-500">{empty}</span>
        ) : (
          neighbors.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelect(n.id)}
              className="glass rounded-full px-2.5 py-1 font-mono text-xs text-ink-700 transition-colors hover:text-accent-600 dark:text-ink-200 dark:hover:text-accent-400"
            >
              {n.label}
            </button>
          ))
        )}
      </dd>
    </div>
  );
}
