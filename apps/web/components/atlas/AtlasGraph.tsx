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
import { AtlasBreadcrumb } from "@/components/atlas/AtlasBreadcrumb";
import { AtlasNodeCard } from "@/components/atlas/AtlasNodeCard";
import { ModuleName } from "@/components/study/Prose";
import { IconSearch } from "@/components/workspace/icons";
import {
  ancestorChain,
  buildAtlasHierarchy,
  type AtlasHierarchy,
  type AtlasNode,
} from "@/lib/atlas-hierarchy";
import {
  anchorAtLayer,
  computeLayer,
  type AtlasLayer,
  type PositionedNode,
} from "@/lib/atlas-layout";
import type { ModuleFacts } from "@/lib/insights";

/** The Atlas — a layered architecture diagram, not a bubble chart.
 *
 * The old version drew the whole repository at once as a circle-packed
 * constellation and used continuous pixel-projected zoom as its level
 * of detail. This version draws exactly one *layer* at a time — the
 * direct children of whichever container is currently open, laid out
 * top-to-bottom by real import direction via `@dagrejs/dagre` — and
 * treats "more detail" as a discrete drill (Repository → Domains →
 * Modules → Folders → Files), the same grammar an IDE's package
 * explorer already teaches. `atlas-hierarchy.ts` still owns the real
 * containment tree and the honest edge-aggregation-to-the-frontier
 * logic; `atlas-layout.ts` turns whichever slice is open into pixels.
 *
 * Two panes stay one instrument regardless: selecting a module in the
 * sibling tree (`selectedId`) or a container (`highlightIds`) opens
 * whatever layer makes it visible and frames it — it does not replace
 * this view with something else. */

const VIEW_W = 880;
const VIEW_H = 600;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.75;
const VIEW_SPRING = { stiffness: 210, damping: 30, mass: 0.9 } as const;
const FIT_PAD = 44;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The nearest ancestor(s) of a set of nodes that all share, minus the
 * nodes themselves — the container whose layer would show every one of
 * them at once. Used both to resolve a single selection (the common
 * path of one node) and a container highlight (several modules under a
 * folder the tree pane selected). */
function commonContainerPath(hierarchy: AtlasHierarchy, nodeIds: string[]): string[] {
  const chains = nodeIds.map((id) => ancestorChain(hierarchy, id).slice(0, -1).map((n) => n.id));
  if (chains.length === 0) return [];
  let common = [...chains[0]!];
  for (const chain of chains.slice(1)) {
    let i = 0;
    while (i < common.length && i < chain.length && common[i] === chain[i]) i += 1;
    common = common.slice(0, i);
  }
  return common;
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
  filePaths,
  keystoneId,
  selectedId,
  highlightIds,
  contextLabel,
  onSelect,
  onSelectPath,
}: {
  modules: ModuleFacts[];
  filePaths: string[];
  keystoneId: string | null;
  selectedId: string | null;
  highlightIds?: string[];
  contextLabel?: string | null;
  onSelect: (id: string | null) => void;
  onSelectPath?: (path: string, isFile: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  const hierarchy = useMemo(
    () => buildAtlasHierarchy(modules, filePaths, keystoneId),
    [modules, filePaths, keystoneId],
  );

  // ——— where we are: an open path from the repository root ———
  const [breadcrumbIds, setBreadcrumbIds] = useState<string[]>([]);
  const containerId = breadcrumbIds[breadcrumbIds.length - 1] ?? null;
  const trail = useMemo(
    () => breadcrumbIds.map((id) => hierarchy.byId.get(id)).filter((n): n is AtlasNode => Boolean(n)),
    [breadcrumbIds, hierarchy],
  );
  const layer = useMemo(() => computeLayer(hierarchy, containerId), [hierarchy, containerId]);
  const rootLayer = useMemo(() => computeLayer(hierarchy, null), [hierarchy]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // ——— viewport: pan/zoom as springs composed into one transform ———
  const svgRef = useRef<SVGSVGElement>(null);
  const tx = useSpring(0, VIEW_SPRING);
  const ty = useSpring(0, VIEW_SPRING);
  const zoom = useSpring(1, VIEW_SPRING);
  const sceneTransform = useTransform(
    [tx, ty, zoom],
    ([x, y, k]: number[]) => `translate(${x} ${y}) scale(${k})`,
  );
  const zoomLabel = useTransform(zoom, (k) => `${Math.round(k * 100)}%`);

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

  /** Fit one layer's whole bounding box to the viewport — the only
   * framing move this design needs. Emphasis inside the layer is a
   * dim/highlight decision (`dimFor`), never a camera decision, so
   * there is no separate "frame just this node" path to keep in sync
   * with it. */
  const fitToLayer = useCallback(
    (l: AtlasLayer, jump: boolean) => {
      if (l.nodes.length === 0) {
        setView({ x: 0, y: 0, k: 1 }, jump);
        return;
      }
      const w = Math.max(l.width, 1);
      const h = Math.max(l.height, 1);
      const k = clamp(Math.min((VIEW_W - FIT_PAD * 2) / w, (VIEW_H - FIT_PAD * 2) / h), MIN_ZOOM, MAX_ZOOM);
      setView({ k, x: CX - (w / 2) * k, y: CY - (h / 2) * k }, jump);
    },
    [setView],
  );

  const goTo = useCallback(
    (ids: string[], jump: boolean) => {
      setBreadcrumbIds(ids);
      fitToLayer(computeLayer(hierarchy, ids[ids.length - 1] ?? null), jump);
    },
    [hierarchy, fitToLayer],
  );

  /** Open a container so its children become the rendered layer — the
   * drill gesture, whether it came from a card's chevron, a breadcrumb
   * segment, or the compass. */
  const enterContainer = useCallback(
    (id: string | null, jump = false) => {
      if (id === null) {
        goTo([], jump);
        return;
      }
      goTo(ancestorChain(hierarchy, id).map((n) => n.id), jump);
    },
    [hierarchy, goTo],
  );

  /** Open whatever container holds `id` so it appears as a card in the
   * new layer, rather than opening `id` itself. What external selection
   * (the tree pane, search, a peer stub) always wants. */
  const revealNode = useCallback(
    (id: string, jump = false) => {
      goTo(ancestorChain(hierarchy, id).slice(0, -1).map((n) => n.id), jump);
    },
    [hierarchy, goTo],
  );

  // ——— external focus: the tree pane (or a deep link) pointing here ———
  const focusKey = selectedId ?? (highlightIds ?? []).join(",");
  const didInitRef = useRef(false);
  useEffect(() => {
    const jump = !didInitRef.current;
    didInitRef.current = true;

    if (selectedId) {
      const nodeId = hierarchy.nodeIdOfModule.get(selectedId);
      if (nodeId) {
        revealNode(nodeId, jump);
        return;
      }
    }
    if (highlightIds && highlightIds.length > 0) {
      const nodeIds = highlightIds
        .map((id) => hierarchy.nodeIdOfModule.get(id))
        .filter((id): id is string => Boolean(id));
      if (nodeIds.length > 0) {
        goTo(commonContainerPath(hierarchy, nodeIds), jump);
        return;
      }
    }
    // Nothing external to focus: on first paint, center the root layer;
    // otherwise leave the camera exactly where the user left it — a
    // cleared selection is not a request to lose your place.
    if (jump) fitToLayer(layer, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, hierarchy]);

  // ——— pointer plumbing (screen → viewBox, wheel zoom, drag pan) ———
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
      const p = pivot ?? { x: CX, y: CY };
      const ratio = k1 / k0;
      setView(
        { k: k1, x: p.x - (p.x - tx.get()) * ratio, y: p.y - (p.y - ty.get()) * ratio },
        jump,
      );
    },
    [setView, tx, ty, zoom],
  );

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
      if (origin) {
        const p = toViewBox(event.clientX, event.clientY);
        if (Math.hypot(p.x - origin.x, p.y - origin.y) < 4) onSelect(null);
      }
    },
    [onSelect, toViewBox],
  );

  // ——— search across the whole hierarchy, independent of the open layer ———
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [pulse, setPulse] = useState<{ id: string; token: number } | null>(null);

  const pulseNode = useCallback((id: string) => setPulse({ id, token: Date.now() }), []);
  useEffect(() => {
    if (!pulse) return;
    const timer = setTimeout(() => setPulse(null), 2600);
    return () => clearTimeout(timer);
  }, [pulse]);

  const kindRank: Record<AtlasNode["kind"], number> = useMemo(
    () => ({ module: 0, domain: 1, folder: 2, file: 3 }),
    [],
  );

  const searchMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const scored: { node: AtlasNode; score: number }[] = [];
    for (const node of hierarchy.byId.values()) {
      const name = node.name.toLowerCase();
      const path = node.path.toLowerCase();
      const score = name.startsWith(q) ? 0 : name.includes(q) ? 1 : path.includes(q) ? 2 : -1;
      if (score >= 0) scored.push({ node, score });
    }
    scored.sort(
      (a, b) =>
        a.score - b.score ||
        kindRank[a.node.kind] - kindRank[b.node.kind] ||
        b.node.fileCount - a.node.fileCount ||
        a.node.path.localeCompare(b.node.path),
    );
    return scored.slice(0, 60).map((s) => s.node);
  }, [query, hierarchy, kindRank]);

  const searchResults = useMemo(() => searchMatches.slice(0, 8), [searchMatches]);

  const goToNode = useCallback(
    (node: AtlasNode) => {
      revealNode(node.id, false);
      pulseNode(node.id);
    },
    [revealNode, pulseNode],
  );

  useEffect(() => {
    if (query.trim().length < 2 || searchMatches.length === 0) return;
    const best = searchMatches[0]!;
    const timer = setTimeout(() => goToNode(best), 320);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMatches]);

  // ——— card interaction ———
  const activateCard = useCallback(
    (entry: PositionedNode) => {
      if (entry.isPeer) revealNode(entry.id);
      const node = entry.node;
      if (node.kind === "module") {
        onSelect(node.id === selectedId ? null : node.id);
      } else if (node.kind === "file") {
        onSelectPath?.(node.path, true);
      } else {
        onSelectPath?.(node.path, false);
      }
      pulseNode(entry.id);
    },
    [revealNode, onSelect, onSelectPath, selectedId, pulseNode],
  );

  // ——— focus mode: hover or an external selection lights this layer's core ———
  // A layer swap can unmount whatever was hovered without a pointer
  // leave event ever firing for it. Rather than an effect to clear the
  // stale id, treat it as valid only while it actually names a card in
  // the layer currently on screen.
  const hoveredInLayer = hoveredId && layer.nodes.some((n) => n.id === hoveredId) ? hoveredId : null;

  const core = useMemo(() => {
    const set = new Set<string>();
    if (hoveredInLayer) {
      set.add(hoveredInLayer);
      return set;
    }
    if (selectedId) {
      const nodeId = hierarchy.nodeIdOfModule.get(selectedId);
      const anchor = nodeId ? anchorAtLayer(hierarchy, containerId, nodeId) : null;
      if (anchor) set.add(anchor);
    }
    if (set.size === 0 && highlightIds) {
      for (const id of highlightIds) {
        const nodeId = hierarchy.nodeIdOfModule.get(id);
        const anchor = nodeId ? anchorAtLayer(hierarchy, containerId, nodeId) : null;
        if (anchor) set.add(anchor);
      }
    }
    return set;
  }, [hoveredInLayer, selectedId, highlightIds, hierarchy, containerId]);

  const neighbors = useMemo(() => {
    const set = new Set<string>();
    if (core.size === 0) return set;
    for (const edge of layer.edges) {
      if (core.has(edge.sourceId)) set.add(edge.targetId);
      if (core.has(edge.targetId)) set.add(edge.sourceId);
    }
    return set;
  }, [layer.edges, core]);

  const focused = core.size > 0;
  const dimFor = useCallback(
    (id: string): number => {
      if (!focused) return 1;
      if (core.has(id) || neighbors.has(id)) return 1;
      return 0.26;
    },
    [focused, core, neighbors],
  );

  const matchedIds = useMemo(() => new Set(searchMatches.map((n) => n.id)), [searchMatches]);

  if (modules.length === 0) return null;

  const selectedModule = selectedId ? (modules.find((m) => m.id === selectedId) ?? null) : null;
  const keystoneNode = keystoneId
    ? (() => {
        const nodeId = hierarchy.nodeIdOfModule.get(keystoneId);
        return nodeId ? (hierarchy.byId.get(nodeId) ?? null) : null;
      })()
    : null;
  const keystoneAnchorId =
    keystoneNode && keystoneId ? anchorAtLayer(hierarchy, containerId, keystoneNode.id) : null;
  const keystoneCard = keystoneAnchorId
    ? layer.nodes.find((n) => n.id === keystoneAnchorId)
    : undefined;

  const pulseEntry = pulse ? layer.nodes.find((n) => n.id === pulse.id) : undefined;
  const showAllEdgeLabels = layer.edges.length <= 14;
  const showsFileLayer = layer.nodes.length > 0 && layer.nodes.every((n) => n.tier === "file");

  return (
    <div className="glass edge-light relative flex h-full flex-col overflow-hidden rounded-[2rem]">
      <div className="flex shrink-0 flex-col gap-2 border-b border-ink-950/8 px-5 py-3 dark:border-white/8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="shrink-0 text-sm font-medium text-ink-950 dark:text-ink-50">
            Repository architecture
          </h2>

          <div className="relative min-w-0 flex-1 max-w-[16rem]">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400 dark:text-ink-500" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchResults.length > 0) {
                  event.preventDefault();
                  goToNode(searchResults[0]!);
                }
                if (event.key === "Escape") {
                  setQuery("");
                  event.currentTarget.blur();
                }
              }}
              placeholder="Find on the map"
              aria-label="Find a module, folder, or file on the map"
              className="w-full rounded-lg border border-ink-950/10 bg-transparent py-1.5 pl-8 pr-2.5 font-mono text-xs text-ink-950 placeholder:text-ink-400 focus:border-accent-500/60 focus:outline-none dark:border-white/12 dark:text-ink-50 dark:placeholder:text-ink-500"
            />
            {searchFocused && query.trim().length >= 2 ? (
              <ul
                className="glass-strong edge-light absolute left-0 right-0 top-full z-20 mt-1.5 flex max-h-64 flex-col overflow-y-auto rounded-xl p-1"
                role="listbox"
                aria-label="Matches on the map"
              >
                {searchResults.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-ink-500 dark:text-ink-400">
                    Nothing on the map matches.
                  </li>
                ) : (
                  searchResults.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          goToNode(result);
                          setSearchFocused(false);
                        }}
                        className="flex w-full items-baseline gap-2 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-ink-950/5 dark:hover:bg-white/8"
                      >
                        <span className="min-w-0 truncate font-mono text-xs text-ink-950 dark:text-ink-50">
                          {result.path}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] text-ink-400 dark:text-ink-500">
                          {result.kind}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>

          <p className="hidden shrink-0 truncate font-mono text-xs text-ink-500 sm:block dark:text-ink-400">
            {contextLabel ??
              `${modules.length} modules · ${hierarchy.moduleEdges.length} imports · ${hierarchy.totalFiles.toLocaleString()} files`}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <AtlasBreadcrumb trail={trail} onJump={enterContainer} />
          {keystoneId && !keystoneCard ? (
            <button
              type="button"
              onClick={() => keystoneNode && revealNode(keystoneNode.id)}
              className="shrink-0 rounded-full bg-accent-500/10 px-2.5 py-1 font-mono text-[11px] text-accent-600 transition-colors hover:bg-accent-500/16 dark:text-accent-400"
            >
              Keystone is in {keystoneNode?.name ?? "another domain"} →
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 55% 60% at 50% 50%, rgb(46 107 255 / 0.05) 0%, transparent 70%)",
          }}
        />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="relative block h-full w-full touch-pan-y xl:touch-none"
          role="group"
          aria-label={`Repository architecture map: ${trail.length > 0 ? `viewing ${trail.map((n) => n.name).join(" / ")}, ` : ""}${layer.nodes.length} items, ${layer.edges.length} import ${layer.edges.length === 1 ? "path" : "paths"}. Open a card's chevron to drill in; use the breadcrumb to go back.`}
          onMouseLeave={() => setHoveredId(null)}
        >
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
            {keystoneCard ? (
              <motion.rect
                x={keystoneCard.x - keystoneCard.width * 0.18}
                y={keystoneCard.y - keystoneCard.height * 0.18}
                width={keystoneCard.width * 1.36}
                height={keystoneCard.height * 1.36}
                rx={18}
                fill="url(#atlas-halo)"
                animate={
                  reduceMotion ? undefined : { opacity: [0.7, 1, 0.7] }
                }
                transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
              />
            ) : null}

            {/* Edges first, so cards paint over their endpoints. */}
            {layer.edges.map((edge, index) => {
              const touches = focused && (core.has(edge.sourceId) || core.has(edge.targetId));
              const dimmed = focused && !touches;
              const width = 1.25 + Math.min(3.5, Math.sqrt(edge.weight) * 0.7);
              const showLabel = showAllEdgeLabels || touches;
              return (
                <g key={`${containerId ?? "root"}:${edge.key}`}>
                  <title>
                    {`${hierarchy.byId.get(edge.sourceId)?.path || hierarchy.byId.get(edge.sourceId)?.name || edge.sourceId} → ${hierarchy.byId.get(edge.targetId)?.path || hierarchy.byId.get(edge.targetId)?.name || edge.targetId}: ${edge.weight} import ${edge.weight === 1 ? "path" : "paths"}${edge.reversed ? " (against the dominant flow — part of a cycle)" : ""}`}
                  </title>
                  <motion.path
                    d={edge.path}
                    fill="none"
                    strokeWidth={touches ? width + 0.6 : width}
                    strokeDasharray={edge.reversed ? "5 4" : undefined}
                    vectorEffect="non-scaling-stroke"
                    className={touches ? "stroke-accent-500" : "stroke-ink-950/20 dark:stroke-white/20"}
                    initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: dimmed ? 0.14 : 1 }}
                    transition={{
                      duration: reduceMotion ? 0 : 0.5,
                      delay: reduceMotion ? 0 : Math.min(index * 0.02, 0.4),
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                  {touches && !edge.reversed && !reduceMotion ? (
                    <path
                      d={edge.path}
                      fill="none"
                      strokeWidth={width + 1.2}
                      strokeLinecap="round"
                      strokeDasharray="6 26"
                      vectorEffect="non-scaling-stroke"
                      className="graph-edge-flow stroke-accent-400"
                      opacity={0.9}
                    />
                  ) : null}
                  <polygon
                    points={edge.arrowPoints}
                    className={touches ? "fill-accent-500" : "fill-ink-950/25 dark:fill-white/25"}
                    opacity={dimmed ? 0.14 : 1}
                  />
                  {showLabel ? (
                    <text
                      x={edge.labelX}
                      y={edge.labelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={9.5}
                      className={`pointer-events-none font-mono ${touches ? "fill-accent-600 dark:fill-accent-400" : "fill-ink-500 dark:fill-ink-400"}`}
                      stroke="var(--background)"
                      strokeWidth={3}
                      style={{ paintOrder: "stroke", opacity: dimmed ? 0.14 : 1 }}
                    >
                      {edge.weight}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {layer.nodes.map((entry, index) => {
              const isSelected =
                !entry.isPeer &&
                entry.node.kind === "module" &&
                selectedId === entry.node.module?.id;
              const isKeystone = entry.id === keystoneAnchorId;
              const isCore = core.has(entry.id);
              const isNeighbor = neighbors.has(entry.id);
              const isHovered = hoveredId === entry.id;
              const isMatched = matchedIds.has(entry.id);
              const drillable = !entry.isPeer && entry.node.kind !== "file" && entry.node.childIds.length > 0;

              return (
                <foreignObject
                  key={`${containerId ?? "root"}:${entry.id}`}
                  x={entry.x}
                  y={entry.y}
                  width={entry.width}
                  height={entry.height}
                  style={{ overflow: "visible" }}
                >
                  <motion.div
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: reduceMotion ? 0 : 0.28,
                      delay: reduceMotion ? 0 : Math.min(index * 0.012, 0.3),
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <AtlasNodeCard
                      node={entry.node}
                      tier={entry.tier}
                      width={entry.width}
                      height={entry.height}
                      isPeer={entry.isPeer}
                      isSelected={isSelected}
                      isKeystone={isKeystone}
                      isHovered={isHovered}
                      isCore={isCore}
                      isNeighbor={isNeighbor}
                      isMatched={isMatched}
                      dim={dimFor(entry.id)}
                      drillable={drillable}
                      onSelect={() => activateCard(entry)}
                      onDrill={() => enterContainer(entry.id)}
                      onHoverChange={(hovering) =>
                        setHoveredId((prev) => (hovering ? entry.id : prev === entry.id ? null : prev))
                      }
                    />
                  </motion.div>
                </foreignObject>
              );
            })}

            {pulseEntry ? (
              <rect
                key={pulse!.token}
                x={pulseEntry.x - 4}
                y={pulseEntry.y - 4}
                width={pulseEntry.width + 8}
                height={pulseEntry.height + 8}
                rx={14}
                fill="none"
                className="graph-node-ripple pointer-events-none stroke-accent-500"
                strokeWidth={2}
              />
            ) : null}
          </motion.g>

          <defs>
            <radialGradient id="atlas-halo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-accent-500)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--color-accent-500)" stopOpacity="0" />
            </radialGradient>
          </defs>
        </svg>

        {layer.nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-ink-400 dark:text-ink-500">Nothing further beneath this boundary.</p>
          </div>
        ) : showsFileLayer ? (
          <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-ink-950/5 px-3 py-1 text-[11px] text-ink-500 dark:bg-white/8 dark:text-ink-400">
            Import edges are tracked at module level — files carry membership, not their own imports.
          </p>
        ) : null}

        {selectedModule ? (
          <ModuleOverlay
            module={selectedModule}
            keystoneId={keystoneId}
            onSelect={onSelect}
            reduceMotion={Boolean(reduceMotion)}
          />
        ) : null}

        {rootLayer.nodes.length > 1 ? (
          <AtlasCompass rootLayer={rootLayer} activeTopId={breadcrumbIds[0] ?? null} onJump={enterContainer} />
        ) : null}

        <ViewControls
          zoomLabel={zoomLabel}
          onZoomIn={() => zoomBy(1.4)}
          onZoomOut={() => zoomBy(1 / 1.4)}
          onReset={() => {
            onSelect(null);
            enterContainer(null);
          }}
        />
      </div>
    </div>
  );
}

/** A miniature rendering of the domains layer — always the same layer
 * this reuses `computeLayer` for, regardless of how deep the main view
 * has drilled — with the open top-level domain highlighted. There is no
 * single shared coordinate space spanning every layer any more (the old
 * minimap's viewport rectangle needed one), so this is a compass rather
 * than a literal viewport indicator: click a domain to open it. */
function AtlasCompass({
  rootLayer,
  activeTopId,
  onJump,
}: {
  rootLayer: AtlasLayer;
  activeTopId: string | null;
  onJump: (id: string) => void;
}) {
  const pad = 10;
  const w = Math.max(rootLayer.width, 1);
  const h = Math.max(rootLayer.height, 1);
  return (
    <div className="glass-strong edge-light absolute bottom-4 right-4 hidden overflow-hidden rounded-xl p-2 md:block">
      <svg
        viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
        className="block h-[6.4rem] w-[9.6rem]"
        role="img"
        aria-label="Domain overview. Select a domain to open it."
      >
        {rootLayer.nodes.map((node) => (
          <rect
            key={node.id}
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx={5}
            strokeWidth={3}
            className={
              node.id === activeTopId
                ? "cursor-pointer fill-accent-500/25 stroke-accent-500"
                : "cursor-pointer fill-ink-950/10 stroke-ink-950/25 hover:fill-ink-950/18 dark:fill-white/10 dark:stroke-white/25 dark:hover:fill-white/18"
            }
            onClick={() => onJump(node.id)}
          />
        ))}
      </svg>
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
