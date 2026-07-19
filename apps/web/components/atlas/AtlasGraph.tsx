"use client";

import {
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@blueprint/ui";
import { ModuleName } from "@/components/study/Prose";
import type { ModuleFacts } from "@/lib/insights";

/** The Atlas — the architectural map, and the Atlas room's primary
 * surface rather than something a click has to earn.
 *
 * The layout is deterministic, not force-directed: the keystone module
 * holds the center, and every other module sits on a ring at its real
 * graph distance from it, so the picture is the architecture (distance
 * from center = distance from the load-bearing wall), stable across
 * every visit, and never jitters for spectacle.
 *
 * The map is *always* the whole repository. Selection never swaps one
 * graph for another — it re-reads the same one. With nothing selected
 * every module is lit and the canvas sits at its home view: this is the
 * complete architecture, all of it, at once. Selecting a module fades
 * the unrelated regions, illuminates that module's import strands, and
 * eases the viewport onto its neighbourhood, so the module's dependency
 * graph is revealed *inside* the repository graph rather than replacing
 * it. Nothing is ever removed, so nothing has to be rebuilt when the
 * selection clears.
 *
 * The canvas is an instrument: pan by dragging, zoom by wheel or the
 * controls, hover to trace a module's strands without committing to it.
 * The selected module's own imports and dependents also read as text in
 * the overlay (RULES.md §16) — the picture is never the only carrier. */

const VIEW_W = 880;
const VIEW_H = 600;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 4;

const VIEW_SPRING = { stiffness: 210, damping: 30, mass: 0.9 } as const;

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  selectedId,
  highlightIds,
  contextLabel,
  onSelect,
}: {
  modules: ModuleFacts[];
  keystoneId: string | null;
  /** The module the explorer is pointing at, or null for the whole map. */
  selectedId: string | null;
  /** Several modules at once — what a container folder like `apps/`
   * lights up, since it holds boundaries without being one. */
  highlightIds?: string[];
  /** What the explorer's current selection means, in the header — it
   * replaces the whole-repository counts while a region is in focus. */
  contextLabel?: string | null;
  onSelect: (id: string | null) => void;
}) {
  const reduceMotion = useReducedMotion();
  const placed = useMemo(() => placeModules(modules), [modules]);
  // The module under the pointer illuminates its strands without
  // committing the selection — the graph answers before it's asked.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
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

  /** What the map is currently *about*. A hover speaks for as long as it
   * lasts and then hands the map back to the selection; with neither,
   * the core is empty and the whole repository reads at full strength. */
  const core = useMemo(() => {
    if (hoveredId) return new Set([hoveredId]);
    if (selectedId) return new Set([selectedId]);
    return new Set(highlightIds ?? []);
  }, [hoveredId, selectedId, highlightIds]);

  // Everything one strand away from the core — those nodes brighten with
  // the edges so the neighborhood reads as one gesture.
  const neighbors = useMemo(() => {
    const set = new Set<string>();
    if (core.size === 0) return set;
    for (const { from, to } of edges) {
      if (core.has(from.id)) set.add(to.id);
      if (core.has(to.id)) set.add(from.id);
    }
    return set;
  }, [edges, core]);

  // ——— The viewport. Pan/zoom as three springs, composed into the one
  // transform on the scene group. Springs rather than React state so a
  // drag never re-renders 200 nodes, and so the jump to a selected
  // module's neighbourhood *eases* there instead of cutting.
  const svgRef = useRef<SVGSVGElement>(null);
  // Seeded with plain numbers, not a source motion value — these springs
  // are driven directly by `setView`, and a spring that tracks a source
  // would ignore those writes.
  const tx = useSpring(0, VIEW_SPRING);
  const ty = useSpring(0, VIEW_SPRING);
  const zoom = useSpring(1, VIEW_SPRING);
  const sceneTransform = useTransform(
    [tx, ty, zoom],
    ([x, y, k]: number[]) => `translate(${x} ${y}) scale(${k})`,
  );
  // The readout is a motion value, not state: subscribing to the spring
  // with `useState` would re-render every node on every frame of a zoom,
  // which is exactly the cost the springs exist to avoid.
  const zoomLabel = useTransform(zoom, (k) => `${Math.round(k * 100)}%`);

  /** `jump` skips the spring — right for a drag, where the canvas must
   * track the pointer exactly, and for reduced motion. */
  const setView = useCallback(
    (next: { x: number; y: number; k: number }, jump: boolean) => {
      if (jump || reduceMotion) {
        tx.jump(next.x);
        ty.jump(next.y);
        zoom.jump(next.k);
      } else {
        tx.set(next.x);
        ty.set(next.y);
        zoom.set(next.k);
      }
    },
    [tx, ty, zoom, reduceMotion],
  );

  const homeView = useCallback(() => setView({ x: 0, y: 0, k: 1 }, false), [setView]);

  /** Ease the viewport onto a set of nodes. This is the "transition to
   * the module's dependency graph" — the same scene, moved and scaled
   * until that module's neighbourhood fills the stage. */
  const frameNodes = useCallback(
    (nodes: PlacedNode[]) => {
      if (nodes.length === 0) {
        homeView();
        return;
      }
      const pad = 110;
      const minX = Math.min(...nodes.map((n) => n.x - n.r)) - pad;
      const maxX = Math.max(...nodes.map((n) => n.x + n.r)) + pad;
      const minY = Math.min(...nodes.map((n) => n.y - n.r)) - pad;
      const maxY = Math.max(...nodes.map((n) => n.y + n.r)) + pad;
      const k = clamp(
        Math.min(VIEW_W / (maxX - minX), VIEW_H / (maxY - minY)),
        0.8,
        1.9,
      );
      setView(
        {
          k,
          x: CX - ((minX + maxX) / 2) * k,
          y: CY - ((minY + maxY) / 2) * k,
        },
        false,
      );
    },
    [homeView, setView],
  );

  // Selection moves the viewport; hover never does. A hover is a glance,
  // and a canvas that lurches under a passing pointer is unusable.
  const focusKey = selectedId ?? (highlightIds ?? []).join(",");
  useEffect(() => {
    const anchors = selectedId
      ? [selectedId]
      : (highlightIds ?? []);
    if (anchors.length === 0) {
      homeView();
      return;
    }
    const ids = new Set(anchors);
    for (const { from, to } of edges) {
      if (ids.has(from.id)) ids.add(to.id);
      if (ids.has(to.id)) ids.add(from.id);
    }
    frameNodes([...ids].map((id) => placed.get(id)).filter((n): n is PlacedNode => Boolean(n)));
    // `focusKey` collapses the selection to a stable string so an
    // unchanged `highlightIds` array identity can't re-frame the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  /** Client pixels → the SVG's own coordinate space, so zoom can pivot
   * on the pointer and a drag can move the scene 1:1 under it.
   *
   * This has to undo `preserveAspectRatio="xMidYMid meet"`, not just
   * divide by the element's size: the viewBox is fitted by its tighter
   * axis and centred, so on any panel that isn't exactly 880:600 there
   * are letterbox bars, and ignoring them makes the canvas drift out
   * from under the pointer. */
  const toViewBox = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const fit = Math.min(rect.width / VIEW_W, rect.height / VIEW_H);
    const barX = (rect.width - VIEW_W * fit) / 2;
    const barY = (rect.height - VIEW_H * fit) / 2;
    return {
      x: (clientX - rect.left - barX) / fit,
      y: (clientY - rect.top - barY) / fit,
    };
  }, []);

  const zoomBy = useCallback(
    (factor: number, pivot?: { x: number; y: number }, jump = false) => {
      const k0 = zoom.get();
      const k1 = clamp(k0 * factor, MIN_ZOOM, MAX_ZOOM);
      if (k1 === k0) return;
      // Zoom about the pivot: the world point under it stays under it.
      const p = pivot ?? { x: CX, y: CY };
      const ratio = k1 / k0;
      setView(
        {
          k: k1,
          x: p.x - (p.x - tx.get()) * ratio,
          y: p.y - (p.y - ty.get()) * ratio,
        },
        jump,
      );
    },
    [setView, tx, ty, zoom],
  );

  // Wheel-to-zoom is registered by hand because React's synthetic wheel
  // listener is passive — it cannot `preventDefault`, so the page would
  // scroll out from under the map.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomBy(Math.exp(-event.deltaY * 0.0016), toViewBox(event.clientX, event.clientY), true);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomBy, toViewBox]);

  // Drag-to-pan, started only from the backdrop so a press on a module
  // is still a selection.
  const dragOrigin = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const onBackdropPointerDown = useCallback(
    (event: React.PointerEvent<SVGRectElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const p = toViewBox(event.clientX, event.clientY);
      dragOrigin.current = { x: p.x, y: p.y, tx: tx.get(), ty: ty.get() };
      setPanning(true);
    },
    [toViewBox, tx, ty],
  );

  const onBackdropPointerMove = useCallback(
    (event: React.PointerEvent<SVGRectElement>) => {
      const origin = dragOrigin.current;
      if (!origin) return;
      const p = toViewBox(event.clientX, event.clientY);
      setView(
        { x: origin.tx + (p.x - origin.x), y: origin.ty + (p.y - origin.y), k: zoom.get() },
        true,
      );
    },
    [setView, toViewBox, zoom],
  );

  const endPan = useCallback(
    (event: React.PointerEvent<SVGRectElement>) => {
      const origin = dragOrigin.current;
      dragOrigin.current = null;
      setPanning(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      // A press on empty space that didn't travel is a click: clear the
      // selection and return the map to the whole repository.
      if (origin) {
        const p = toViewBox(event.clientX, event.clientY);
        if (Math.hypot(p.x - origin.x, p.y - origin.y) < 4) onSelect(null);
      }
    },
    [onSelect, toViewBox],
  );

  if (modules.length === 0) return null;

  const maxRing = Math.max(1, ...modules.map((m) => m.ring));
  const rings = [...new Set(modules.map((m) => m.ring))].filter((ring) => ring > 0);
  const focused = core.size > 0;

  return (
    <div className="glass edge-light relative flex h-full flex-col overflow-hidden rounded-[2rem]">
      <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-ink-950/8 px-5 py-4 dark:border-white/8">
        <h2 className="text-sm font-medium text-ink-950 dark:text-ink-50">
          Repository architecture
        </h2>
        <p className="truncate font-mono text-xs text-ink-500 dark:text-ink-400">
          {contextLabel ?? `${modules.length} modules · ${edges.length} imports`}
        </p>
      </div>

      <div className="relative min-h-0 flex-1">
        {/* The viewport's own depth: a faint pool of light under the
            keystone so the center of gravity reads before any label. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 55% 60% at 50% 50%, rgb(46 107 255 / 0.05) 0%, transparent 70%)",
          }}
        />
        {/* `touch-pan-y` below xl: a vertical swipe still scrolls the
            page, so a full-height map on a phone isn't a scroll trap.
            Side by side at xl, the map takes the whole gesture. */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="relative block h-full w-full touch-pan-y xl:touch-none"
          role="group"
          aria-label={`Repository architecture map: ${modules.length} modules, ${edges.length} import relationships. Drag to pan, scroll to zoom, select a module to trace what it depends on.`}
          onMouseLeave={() => setHoveredId(null)}
        >
          <defs>
            <radialGradient id="atlas-halo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-accent-500)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-accent-500)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* The backdrop sits outside the scene transform so it always
              covers the viewport, however far the scene has been panned. */}
          <rect
            x={0}
            y={0}
            width={VIEW_W}
            height={VIEW_H}
            fill="transparent"
            className={panning ? "cursor-grabbing" : "cursor-grab"}
            onPointerDown={onBackdropPointerDown}
            onPointerMove={onBackdropPointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
          />

          <motion.g transform={sceneTransform}>
            {/* Orbit guides — the rings modules actually sit on. */}
            {rings.map((ring) => {
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

            {/* The keystone's halo breathes — the one place the stage is
                allowed a pulse, because it marks the system's center of
                gravity, not a decoration. */}
            {keystoneId && placed.get(keystoneId) ? (
              <motion.circle
                cx={placed.get(keystoneId)!.x}
                cy={placed.get(keystoneId)!.y}
                r={placed.get(keystoneId)!.r * 3.1}
                fill="url(#atlas-halo)"
                style={{
                  transformOrigin: `${placed.get(keystoneId)!.x}px ${placed.get(keystoneId)!.y}px`,
                }}
                animate={reduceMotion ? undefined : { scale: [1, 1.12, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
              />
            ) : null}

            {/* Import edges. Direction reads from the arrowhead; the
                core's strands illuminate and carry current. */}
            {edges.map(({ key, from, to }) => {
              const touches = focused && (core.has(from.id) || core.has(to.id));
              const dimmed = focused && !touches;
              return (
                <g key={key}>
                  <motion.path
                    d={edgePath(from, to)}
                    fill="none"
                    strokeWidth={touches ? 1.8 : 1.2}
                    className={touches ? "stroke-accent-500" : "stroke-ink-950/20 dark:stroke-white/20"}
                    initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: dimmed ? 0.16 : 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
                  />
                  {/* Current along the lit strand — dependency as flow,
                      not just line. Skipped under reduced motion (the
                      solid accent stroke already carries the state). */}
                  {touches && !reduceMotion ? (
                    <path
                      d={edgePath(from, to)}
                      fill="none"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeDasharray="6 26"
                      className="graph-edge-flow stroke-accent-400"
                      opacity={0.9}
                    />
                  ) : null}
                  {/* Arrowhead at the target rim, oriented along the final segment. */}
                  <ArrowHead from={from} to={to} active={touches} dimmed={dimmed} />
                </g>
              );
            })}

            {/* Modules. */}
            {[...placed.values()].map((node, index) => {
              const isCore = core.has(node.id);
              const isSelected = node.id === selectedId;
              const isKeystone = node.id === keystoneId;
              const isNeighbor = neighbors.has(node.id);
              // Faded, never removed — the unrelated architecture stays
              // on the map so the selection reads as a region of the
              // repository rather than a different picture.
              const isDimmed = focused && !isCore && !isNeighbor;
              const lit = isCore || node.id === hoveredId;
              return (
                <motion.g
                  key={node.id}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
                  animate={{ opacity: isDimmed ? 0.22 : 1, scale: 1 }}
                  transition={{
                    opacity: { duration: reduceMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] },
                    scale: {
                      duration: reduceMotion ? 0 : 0.5,
                      delay: reduceMotion ? 0 : 0.1 + node.ring * 0.12 + index * 0.02,
                      ease: [0.22, 1, 0.36, 1],
                    },
                  }}
                  style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                >
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    aria-label={`${node.label}: ${node.fileCount} files, imports ${node.dependsOn.length}, imported by ${node.dependedOnBy.length}`}
                    onClick={() => onSelect(isSelected ? null : node.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(isSelected ? null : node.id);
                      }
                    }}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId((id) => (id === node.id ? null : id))}
                    onFocus={(event) => {
                      if (event.currentTarget.matches(":focus-visible")) {
                        setFocusVisibleId(node.id);
                      }
                      setHoveredId(node.id);
                    }}
                    onBlur={() => {
                      setFocusVisibleId((id) => (id === node.id ? null : id));
                      setHoveredId((id) => (id === node.id ? null : id));
                    }}
                    whileHover={reduceMotion ? undefined : { scale: 1.08 }}
                    transition={{ type: "spring", stiffness: 340, damping: 22 }}
                    style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                    className={`cursor-pointer outline-none transition-[stroke,filter] duration-200 ${
                      lit
                        ? "fill-white stroke-accent-500 drop-shadow-[0_0_14px_rgb(46_107_255/0.45)] dark:fill-ink-800"
                        : isNeighbor
                          ? "fill-white/95 stroke-accent-400/70 dark:fill-ink-800/95"
                          : "fill-white/90 stroke-ink-950/15 hover:stroke-ink-950/40 dark:fill-ink-800/90 dark:stroke-white/15 dark:hover:stroke-white/40"
                    }`}
                    strokeWidth={lit ? 2 : 1.25}
                  />
                  {/* The selected module wears a ring of its own, so which
                      module the explorer is pointing at survives a hover
                      landing somewhere else. */}
                  {isSelected ? (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.r + 7}
                      fill="none"
                      className="pointer-events-none stroke-accent-500/70"
                      strokeWidth={1.5}
                    />
                  ) : null}
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
                    className={`pointer-events-none font-mono text-[11px] transition-colors duration-200 ${
                      lit
                        ? "fill-ink-950 font-semibold dark:fill-ink-50"
                        : isNeighbor
                          ? "fill-ink-800 dark:fill-ink-100"
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
          </motion.g>
        </svg>

        {/* What the architect knows about the selected module — floated
            over the map rather than beside it, so the architecture keeps
            the whole panel and the reading sits on top of the thing it
            describes. */}
        {selected ? (
          <ModuleOverlay
            module={selected}
            keystoneId={keystoneId}
            onSelect={onSelect}
            reduceMotion={Boolean(reduceMotion)}
          />
        ) : null}

        <ViewControls
          zoomLabel={zoomLabel}
          onZoomIn={() => zoomBy(1.3)}
          onZoomOut={() => zoomBy(1 / 1.3)}
          onReset={() => {
            onSelect(null);
            homeView();
          }}
        />
      </div>
    </div>
  );
}

function ViewControls({
  zoomLabel,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  zoomLabel: MotionValue<string>;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  const button =
    "flex size-8 items-center justify-center rounded-lg text-ink-600 transition-colors hover:bg-ink-950/6 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-white/8 dark:hover:text-ink-50";
  return (
    <div className="glass-strong edge-light absolute bottom-4 left-4 flex items-center gap-0.5 rounded-xl p-1">
      <button type="button" onClick={onZoomOut} className={button} aria-label="Zoom out">
        <span aria-hidden className="text-base leading-none">
          −
        </span>
      </button>
      <motion.span
        aria-hidden
        className="w-11 text-center font-mono text-[11px] text-ink-500 tabular-nums dark:text-ink-400"
      >
        {zoomLabel}
      </motion.span>
      <button type="button" onClick={onZoomIn} className={button} aria-label="Zoom in">
        <span aria-hidden className="text-base leading-none">
          +
        </span>
      </button>
      <span className="mx-0.5 h-5 w-px bg-ink-950/8 dark:bg-white/10" />
      <button
        type="button"
        onClick={onReset}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-950/6 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-white/8 dark:hover:text-ink-50"
      >
        Whole repository
      </button>
    </div>
  );
}

function ModuleOverlay({
  module,
  keystoneId,
  onSelect,
  reduceMotion,
}: {
  module: ModuleFacts;
  keystoneId: string | null;
  onSelect: (id: string | null) => void;
  reduceMotion: boolean;
}) {
  return (
    <motion.aside
      key={module.id}
      aria-live="polite"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className="glass-strong edge-light absolute right-4 top-4 flex max-h-[calc(100%-2rem)] w-[19rem] max-w-[calc(100%-2rem)] flex-col gap-4 overflow-y-auto overscroll-contain rounded-2xl p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 font-mono text-base font-semibold text-ink-950 dark:text-ink-50">
          <ModuleName label={module.label} />
        </h3>
        <Badge tone={module.nodeType === "service" ? "accent" : "neutral"}>{module.nodeType}</Badge>
      </div>

      <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">
        {roleSentence(module, keystoneId)}
      </p>

      <dl className="flex flex-col gap-4 border-t border-ink-950/8 pt-4 text-sm dark:border-white/8">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-ink-500 dark:text-ink-400">Files behind the boundary</dt>
          <dd className="font-mono text-ink-950 dark:text-ink-50">{module.fileCount}</dd>
        </div>
        <NeighborList
          label="Imports"
          empty="nothing at module level"
          neighbors={module.dependsOn}
          onSelect={onSelect}
        />
        <NeighborList
          label="Imported by"
          empty="no module leans on it"
          neighbors={module.dependedOnBy}
          onSelect={onSelect}
        />
      </dl>
    </motion.aside>
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
      className={active ? "fill-accent-500" : "fill-ink-950/25 dark:fill-white/25"}
      opacity={dimmed ? 0.16 : 1}
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
