"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@blueprint/ui";
import { ModuleName } from "@/components/study/Prose";
import { IconSearch } from "@/components/workspace/icons";
import {
  aggregateEdges,
  ancestorChain,
  anchorOf,
  ATLAS_VIEW_H,
  ATLAS_VIEW_W,
  buildAtlasHierarchy,
  type AtlasHierarchy,
  type AtlasNode,
} from "@/lib/atlas-hierarchy";
import type { ModuleFacts } from "@/lib/insights";

/** The Atlas — the architectural map, redrawn as a map in the Google
 * Maps sense: countries first, then cities, then streets.
 *
 * The home view never shows every file, or even every module. It shows
 * the repository's top-level shape — a handful of domains, each a real
 * directory, connected by aggregated import strands. Zooming in is the
 * disclosure gesture: when a container grows past a screen-size
 * threshold it opens and its children appear inside it (domains resolve
 * into modules, modules into folders and files), and zooming back out
 * folds them away again. The level of detail is a pure function of the
 * viewport, so the map adapts continuously and nothing ever has to be
 * expanded by hand — though clicking a closed container zooms the
 * viewport until it opens, which is the same thing spelled as a click.
 *
 * Nothing here is generated: the hierarchy is the repository's actual
 * directory tree with the backend's module boundaries marked on it, and
 * every strand between closed containers carries the count of real
 * module-to-module import paths it aggregates. Files never grow edges,
 * because file-level imports are not data this page has — containment
 * is the honest statement.
 *
 * Rendering is bounded regardless of repository size: only children of
 * open containers exist in the DOM, anything outside the viewport or
 * below ~3 screen pixels is culled with its whole subtree, and the
 * hierarchy is laid out exactly once, deterministically, so the same
 * repository always draws the same map. */

const VIEW_W = ATLAS_VIEW_W;
const VIEW_H = ATLAS_VIEW_H;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;

const MIN_ZOOM = 0.5;

/** Screen-pixel thresholds for the level-of-detail tiers. A container
 * opens when it projects larger than OPEN_PX; labels and metadata
 * arrive at their own sizes. All thresholds are in on-screen pixels so
 * a large domain opens sooner than a small one, exactly like a map. */
const OPEN_PX = 175;
const DETAIL_PX = 72;
const LABEL_PX = 16;
const MIN_PX = 2.5;
const CULL_MARGIN = 90;
/** Hard ceiling on simultaneously rendered nodes — the culling should
 * keep counts far below this; the cap is the seatbelt, not the plan. */
const MAX_RENDERED = 600;

const VIEW_SPRING = { stiffness: 210, damping: 30, mass: 0.9 } as const;

type Tier = "dot" | "labeled" | "detailed" | "open";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The level-of-detail pass: walk the hierarchy top-down, skip whole
 * subtrees that are off-viewport or too small to see, open containers
 * that project large enough, and stop descending at closed ones. Pure
 * over (viewport, hierarchy), so the same view always renders the same
 * map. Insertion order is parent-before-child, which is also the SVG
 * paint order the renderer relies on. */
function computeTiers(
  h: AtlasHierarchy,
  txv: number,
  tyv: number,
  k: number,
  fit: number,
): Map<string, Tier> {
  const tiers = new Map<string, Tier>();
  const entries: { id: string; px: number }[] = [];

  const visit = (id: string) => {
    const node = h.byId.get(id);
    if (!node) return;
    const vx = node.x * k + txv;
    const vy = node.y * k + tyv;
    const vr = node.r * k;
    if (
      vx + vr < -CULL_MARGIN ||
      vx - vr > VIEW_W + CULL_MARGIN ||
      vy + vr < -CULL_MARGIN ||
      vy - vr > VIEW_H + CULL_MARGIN
    ) {
      return;
    }
    const px = vr * fit;
    if (px < MIN_PX) return;
    if (node.kind !== "file" && node.childIds.length > 0 && px > OPEN_PX) {
      tiers.set(id, "open");
      entries.push({ id, px });
      for (const childId of node.childIds) visit(childId);
      return;
    }
    tiers.set(id, px > DETAIL_PX ? "detailed" : px > LABEL_PX ? "labeled" : "dot");
    entries.push({ id, px });
  };

  for (const id of h.topIds) visit(id);

  if (tiers.size > MAX_RENDERED) {
    const keep = new Set(
      [...entries].sort((a, b) => b.px - a.px).slice(0, MAX_RENDERED).map((e) => e.id),
    );
    for (const id of [...tiers.keys()]) {
      if (!keep.has(id)) tiers.delete(id);
    }
  }
  return tiers;
}

function tiersKey(tiers: Map<string, Tier>): string {
  let key = "";
  for (const [id, tier] of tiers) key += `${id}:${tier};`;
  return key;
}

/** A gently bowed path between two circles, trimmed to their rims. */
function edgePath(a: AtlasNode, b: AtlasNode): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const arrow = clamp(b.r * 0.32, 3.5, 12);
  const sx = a.x + ux * (a.r + 2);
  const sy = a.y + uy * (a.r + 2);
  const ex = b.x - ux * (b.r + arrow + 3);
  const ey = b.y - uy * (b.r + arrow + 3);
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

function nodeAriaLabel(node: AtlasNode): string {
  if (node.kind === "file") return `${node.path} — one file`;
  if (node.kind === "module") {
    const m = node.module;
    return m
      ? `${node.path}: module, ${m.fileCount} files, imports ${m.dependsOn.length}, imported by ${m.dependedOnBy.length}`
      : `${node.path}: module`;
  }
  const what = node.moduleCount > 0 ? `${node.moduleCount} modules, ` : "";
  return `${node.path}: ${what}${node.fileCount} files. Activate to zoom in.`;
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
  /** Every file path in the study — the map's street level. */
  filePaths: string[];
  keystoneId: string | null;
  /** The module the explorer is pointing at, or null for the whole map. */
  selectedId: string | null;
  /** Several modules at once — what a container folder like `apps/`
   * lights up, since it holds boundaries without being one. */
  highlightIds?: string[];
  /** What the explorer's current selection means, in the header. */
  contextLabel?: string | null;
  onSelect: (id: string | null) => void;
  /** A non-module place on the map was chosen — a domain, folder, or
   * file. The explorer mirrors it so both panes stay one instrument. */
  onSelectPath?: (path: string, isFile: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  const hierarchy = useMemo(
    () => buildAtlasHierarchy(modules, filePaths, keystoneId),
    [modules, filePaths, keystoneId],
  );
  const maxZoom = hierarchy.maxZoom;

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Keyboard-focus ring, drawn in SVG — a CSS outline on a <circle>
  // traces the bounding box, which reads as a broken rectangle.
  const [focusVisibleId, setFocusVisibleId] = useState<string | null>(null);

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

  /** The letterbox-corrected scale from viewBox units to screen pixels
   * — the level-of-detail thresholds are in screen pixels, so this is
   * part of the LOD input, refreshed by resize. A motion value rather
   * than a ref so event handlers can read it without tripping the
   * compiler's render-time ref-access rule. */
  const fitScale = useMotionValue(1);

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

  // ——— the level-of-detail state, derived from the viewport ———
  const [tiers, setTiers] = useState<Map<string, Tier>>(() =>
    computeTiers(hierarchy, 0, 0, 1, 1),
  );
  const tiersKeyRef = useRef(tiersKey(tiers));

  const recompute = useCallback(() => {
    const next = computeTiers(hierarchy, tx.get(), ty.get(), zoom.get(), fitScale.get());
    const key = tiersKey(next);
    if (key !== tiersKeyRef.current) {
      tiersKeyRef.current = key;
      setTiers(next);
    }
  }, [hierarchy, tx, ty, zoom, fitScale]);

  // Recompute on every viewport frame, deduped through rAF; state only
  // actually changes when a node crosses a tier threshold or the screen
  // edge, so zoom frames are almost always render-free.
  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        recompute();
      });
    };
    const unsubs = [tx.on("change", schedule), ty.on("change", schedule), zoom.on("change", schedule)];
    recompute();
    return () => {
      for (const unsub of unsubs) unsub();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [recompute, tx, ty, zoom]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(() => {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        fitScale.set(Math.min(rect.width / VIEW_W, rect.height / VIEW_H));
        recompute();
      }
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [recompute, fitScale]);

  const openSet = useMemo(() => {
    const set = new Set<string>();
    for (const [id, tier] of tiers) if (tier === "open") set.add(id);
    return set;
  }, [tiers]);
  const openKey = useMemo(() => [...openSet].sort().join("|"), [openSet]);
  const isOpen = useCallback((id: string) => openSet.has(id), [openSet]);

  // ——— edges, aggregated to the visible frontier ———
  const edges = useMemo(
    () =>
      aggregateEdges(hierarchy, isOpen)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 300),
    // openKey stands in for isOpen — same information, stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hierarchy, openKey],
  );

  // ——— focus mode: what the map is currently about ———
  const selectedAnchorId = useMemo(() => {
    if (!selectedId) return null;
    const nodeId = hierarchy.nodeIdOfModule.get(selectedId);
    return nodeId ? anchorOf(hierarchy, nodeId, isOpen) : null;
  }, [selectedId, hierarchy, isOpen]);

  const highlightAnchorIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of highlightIds ?? []) {
      const nodeId = hierarchy.nodeIdOfModule.get(id);
      if (nodeId) set.add(anchorOf(hierarchy, nodeId, isOpen));
    }
    return set;
  }, [highlightIds, hierarchy, isOpen]);

  const core = useMemo(() => {
    if (hoveredId) return new Set([hoveredId]);
    if (selectedAnchorId) return new Set([selectedAnchorId]);
    return highlightAnchorIds;
  }, [hoveredId, selectedAnchorId, highlightAnchorIds]);

  const neighbors = useMemo(() => {
    const set = new Set<string>();
    if (core.size === 0) return set;
    for (const edge of edges) {
      if (core.has(edge.sourceId)) set.add(edge.targetId);
      if (core.has(edge.targetId)) set.add(edge.sourceId);
    }
    return set;
  }, [edges, core]);

  // An open shell containing the core must not fade with the unrelated
  // regions — it is the core's own neighbourhood.
  const coreAncestors = useMemo(() => {
    const set = new Set<string>();
    for (const id of core) {
      for (const node of ancestorChain(hierarchy, id)) set.add(node.id);
    }
    for (const id of core) set.delete(id);
    return set;
  }, [core, hierarchy]);

  const focused = core.size > 0;

  // ——— framing ———
  const frameNodes = useCallback(
    (nodes: AtlasNode[]) => {
      if (nodes.length === 0) {
        homeView();
        return;
      }
      const pad = 90;
      const minX = Math.min(...nodes.map((n) => n.x - n.r)) - pad;
      const maxX = Math.max(...nodes.map((n) => n.x + n.r)) + pad;
      const minY = Math.min(...nodes.map((n) => n.y - n.r)) - pad;
      const maxY = Math.max(...nodes.map((n) => n.y + n.r)) + pad;
      const k = clamp(Math.min(VIEW_W / (maxX - minX), VIEW_H / (maxY - minY)), 0.8, maxZoom);
      setView(
        { k, x: CX - ((minX + maxX) / 2) * k, y: CY - ((minY + maxY) / 2) * k },
        false,
      );
    },
    [homeView, setView, maxZoom],
  );

  /** Ease the viewport onto one node at a chosen on-screen size — the
   * click-to-disclose gesture: target a size past OPEN_PX and the
   * container will open on arrival. */
  const frameNode = useCallback(
    (node: AtlasNode, targetPx: number) => {
      const fit = fitScale.get() || 1;
      const k = clamp(targetPx / (node.r * fit), MIN_ZOOM, maxZoom);
      setView({ k, x: CX - node.x * k, y: CY - node.y * k }, false);
    },
    [setView, maxZoom, fitScale],
  );

  // Selection moves the viewport; hover never does.
  const focusKey = selectedId ?? (highlightIds ?? []).join(",");
  useEffect(() => {
    const anchors = selectedAnchorId ? [selectedAnchorId] : [...highlightAnchorIds];
    if (anchors.length === 0) {
      homeView();
      return;
    }
    const ids = new Set(anchors);
    for (const edge of edges) {
      if (ids.has(edge.sourceId)) ids.add(edge.targetId);
      if (ids.has(edge.targetId)) ids.add(edge.sourceId);
    }
    frameNodes(
      [...ids]
        .map((id) => hierarchy.byId.get(id))
        .filter((n): n is AtlasNode => Boolean(n)),
    );
    // `focusKey` collapses the selection to a stable string; the anchors
    // and edges read the frontier as it stood when the selection changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

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
      const k1 = clamp(k0 * factor, MIN_ZOOM, maxZoom);
      if (k1 === k0) return;
      const p = pivot ?? { x: CX, y: CY };
      const ratio = k1 / k0;
      setView(
        { k: k1, x: p.x - (p.x - tx.get()) * ratio, y: p.y - (p.y - ty.get()) * ratio },
        jump,
      );
    },
    [setView, tx, ty, zoom, maxZoom],
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

  // ——— search in the graph ———
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [pulse, setPulse] = useState<{ id: string; token: number } | null>(null);

  const pulseNode = useCallback((id: string) => {
    setPulse({ id, token: Date.now() });
  }, []);
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
      const score = name.startsWith(q)
        ? 0
        : name.includes(q)
          ? 1
          : path.includes(q)
            ? 2
            : -1;
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

  const matchedIds = useMemo(() => new Set(searchMatches.map((n) => n.id)), [searchMatches]);
  const searchResults = useMemo(() => searchMatches.slice(0, 8), [searchMatches]);

  const goToNode = useCallback(
    (node: AtlasNode) => {
      if (node.kind === "module") {
        frameNode(node, OPEN_PX * 0.9);
        if (node.id !== selectedId) onSelect(node.id);
      } else if (node.kind === "file") {
        frameNode(node, 34);
        onSelectPath?.(node.path, true);
      } else {
        frameNode(node, OPEN_PX * 1.5);
        onSelectPath?.(node.path, false);
      }
      pulseNode(node.id);
    },
    [frameNode, onSelect, onSelectPath, pulseNode, selectedId],
  );

  // Typing recenters the map onto the best match — highlight is
  // instant, the flight is debounced so the map doesn't chase every
  // keystroke through a word.
  useEffect(() => {
    if (query.trim().length < 2 || searchMatches.length === 0) return;
    const best = searchMatches[0]!;
    const timer = setTimeout(() => {
      frameNode(
        best,
        best.kind === "file" ? 34 : best.kind === "module" ? OPEN_PX * 0.9 : OPEN_PX * 1.5,
      );
      pulseNode(best.id);
    }, 320);
    return () => clearTimeout(timer);
    // Flying should re-run when the match changes, not when frameNode's
    // identity does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMatches]);

  // ——— node interaction ———
  const activateNode = useCallback(
    (node: AtlasNode) => {
      if (node.kind === "module") {
        onSelect(node.id === selectedId ? null : node.id);
        return;
      }
      if (node.kind === "file") {
        onSelectPath?.(node.path, true);
        pulseNode(node.id);
        return;
      }
      // A closed domain or folder: zoom until it opens — the click is
      // progressive disclosure, and the explorer mirrors the selection.
      onSelectPath?.(node.path, false);
      frameNode(node, OPEN_PX * 1.5);
    },
    [onSelect, onSelectPath, frameNode, pulseNode, selectedId],
  );

  if (modules.length === 0) return null;

  const selectedModule = selectedId
    ? (modules.find((m) => m.id === selectedId) ?? null)
    : null;
  const keystoneAnchorId = keystoneId
    ? (() => {
        const nodeId = hierarchy.nodeIdOfModule.get(keystoneId);
        return nodeId ? anchorOf(hierarchy, nodeId, isOpen) : null;
      })()
    : null;

  const renderEntries = [...tiers.entries()];
  const shellEntries = renderEntries.filter(([, tier]) => tier === "open");
  const leafEntries = renderEntries.filter(([, tier]) => tier !== "open");

  const dimFor = (id: string): number => {
    if (!focused) return 1;
    if (core.has(id)) return 1;
    if (neighbors.has(id)) return 1;
    if (coreAncestors.has(id)) return 0.85;
    // A leaf inside the core's own open container is context, not noise.
    const node = hierarchy.byId.get(id);
    if (node?.parentId && (core.has(node.parentId) || coreAncestors.has(node.parentId))) return 0.7;
    return 0.22;
  };

  return (
    <div className="glass edge-light relative flex h-full flex-col overflow-hidden rounded-[2rem]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-950/8 px-5 py-3 dark:border-white/8">
        <h2 className="shrink-0 text-sm font-medium text-ink-950 dark:text-ink-50">
          Repository architecture
        </h2>

        {/* Search lives on the map, not just the explorer: matches light
            up on the canvas, the viewport flies to the best one, and the
            landing is marked with a pulse. */}
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
                      // Fire before blur closes the list.
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
          aria-label={`Repository architecture map: ${hierarchy.topIds.length} top-level areas, ${modules.length} modules, ${hierarchy.totalFiles} files. Zoom in to open an area into its modules and files; drag to pan; select a module to trace what it depends on.`}
          onMouseLeave={() => setHoveredId(null)}
        >
          <defs>
            <radialGradient id="atlas-halo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-accent-500)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-accent-500)" stopOpacity="0" />
            </radialGradient>
          </defs>

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
            {/* Open containers first — the regions the leaves sit inside. */}
            {shellEntries.map(([id]) => {
              const node = hierarchy.byId.get(id);
              if (!node) return null;
              const labelSize = clamp(node.r * 0.085, 7, 16);
              const dim = dimFor(id);
              return (
                <motion.g
                  key={id}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: dim }}
                  transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r}
                    className="fill-accent-500/[0.03] stroke-ink-950/12 dark:fill-accent-400/[0.04] dark:stroke-white/12"
                    strokeDasharray="3 6"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* An invisible, fatter rim so the boundary is
                      clickable — selecting a region focuses it without
                      collapsing anything. */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="stroke"
                    className="cursor-pointer"
                    onClick={() =>
                      node.kind === "module"
                        ? onSelect(node.id === selectedId ? null : node.id)
                        : onSelectPath?.(node.path, false)
                    }
                  />
                  <text
                    x={node.x}
                    y={node.y - node.r + labelSize * 1.9}
                    textAnchor="middle"
                    fontSize={labelSize}
                    className="pointer-events-none fill-ink-500 font-mono font-medium dark:fill-ink-400"
                    stroke="var(--background)"
                    strokeWidth={labelSize * 0.28}
                    style={{ paintOrder: "stroke" }}
                  >
                    {node.name}
                    {node.kind === "module" ? " · module" : ""}
                  </text>
                </motion.g>
              );
            })}

            {/* Aggregated import strands between whatever is closed at
                this level of detail. Width carries the count of real
                module-to-module import paths inside the strand. */}
            {edges.map((edge) => {
              const from = hierarchy.byId.get(edge.sourceId);
              const to = hierarchy.byId.get(edge.targetId);
              if (!from || !to) return null;
              const touches = focused && (core.has(edge.sourceId) || core.has(edge.targetId));
              const dimmed = focused && !touches;
              const width = 1 + Math.min(3.5, Math.sqrt(edge.weight) * 0.7);
              return (
                <g key={edge.key}>
                  <title>
                    {`${from.path || from.name} → ${to.path || to.name}: ${edge.weight} import ${edge.weight === 1 ? "path" : "paths"}`}
                  </title>
                  <motion.path
                    d={edgePath(from, to)}
                    fill="none"
                    strokeWidth={touches ? width + 0.6 : width}
                    vectorEffect="non-scaling-stroke"
                    className={touches ? "stroke-accent-500" : "stroke-ink-950/20 dark:stroke-white/20"}
                    initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: dimmed ? 0.14 : 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
                  />
                  {touches && !reduceMotion ? (
                    <path
                      d={edgePath(from, to)}
                      fill="none"
                      strokeWidth={width + 1.2}
                      strokeLinecap="round"
                      strokeDasharray="6 26"
                      vectorEffect="non-scaling-stroke"
                      className="graph-edge-flow stroke-accent-400"
                      opacity={0.9}
                    />
                  ) : null}
                  <EdgeArrow from={from} to={to} active={touches} dimmed={dimmed} />
                </g>
              );
            })}

            {/* The keystone's halo — the system's center of gravity,
                whichever level of detail currently carries it. */}
            {keystoneAnchorId && tiers.has(keystoneAnchorId) && tiers.get(keystoneAnchorId) !== "open"
              ? (() => {
                  const node = hierarchy.byId.get(keystoneAnchorId);
                  if (!node) return null;
                  return (
                    <motion.circle
                      cx={node.x}
                      cy={node.y}
                      r={node.r * 2.6}
                      fill="url(#atlas-halo)"
                      style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                      animate={
                        reduceMotion ? undefined : { scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }
                      }
                      transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
                    />
                  );
                })()
              : null}

            {/* The leaves of the current level of detail: closed
                domains, modules, folders, and files. */}
            {leafEntries.map(([id, tier]) => {
              const node = hierarchy.byId.get(id);
              if (!node) return null;
              const isCore = core.has(id);
              const isSelected = id === selectedAnchorId && selectedId !== null;
              const isKeystone = id === keystoneAnchorId;
              const isNeighbor = neighbors.has(id);
              const isMatched = matchedIds.size > 0 && matchedIds.has(id);
              const dim = dimFor(id);
              const lit = isCore || id === hoveredId;
              const isFile = node.kind === "file";
              const labelSize = isFile
                ? clamp(node.r * 0.75, 4, 9)
                : clamp(node.r * 0.22, 6, 20);
              const metaSize = clamp(node.r * 0.12, 5, 12);
              const countSize = clamp(node.r * 0.26, 5, 13);
              const meta =
                node.kind === "domain" || node.kind === "folder"
                  ? `${node.moduleCount > 0 ? `${node.moduleCount} ${node.moduleCount === 1 ? "module" : "modules"} · ` : ""}${node.fileCount.toLocaleString()} files`
                  : node.kind === "module"
                    ? `${node.fileCount.toLocaleString()} files`
                    : null;
              return (
                <motion.g
                  key={id}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
                  animate={{ opacity: dim, scale: 1 }}
                  transition={{
                    opacity: { duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] },
                    scale: { duration: reduceMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] },
                  }}
                  style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r}
                    tabIndex={isFile && tier === "dot" ? -1 : 0}
                    role="button"
                    aria-pressed={isSelected}
                    aria-label={nodeAriaLabel(node)}
                    onClick={() => activateNode(node)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        activateNode(node);
                      }
                    }}
                    onMouseEnter={() => setHoveredId(id)}
                    onMouseLeave={() => setHoveredId((prev) => (prev === id ? null : prev))}
                    onFocus={(event) => {
                      if (event.currentTarget.matches(":focus-visible")) {
                        setFocusVisibleId(id);
                      }
                      setHoveredId(id);
                    }}
                    onBlur={() => {
                      setFocusVisibleId((prev) => (prev === id ? null : prev));
                      setHoveredId((prev) => (prev === id ? null : prev));
                    }}
                    vectorEffect="non-scaling-stroke"
                    className={`cursor-pointer outline-none transition-[stroke,filter] duration-200 ${
                      lit
                        ? "fill-white stroke-accent-500 drop-shadow-[0_0_14px_rgb(46_107_255/0.45)] dark:fill-ink-800"
                        : isNeighbor
                          ? "fill-white/95 stroke-accent-400/70 dark:fill-ink-800/95"
                          : isFile
                            ? "fill-white/80 stroke-ink-950/12 hover:stroke-ink-950/35 dark:fill-ink-800/80 dark:stroke-white/12 dark:hover:stroke-white/35"
                            : node.kind === "module"
                              ? "fill-white/92 stroke-accent-400/45 hover:stroke-accent-500/80 dark:fill-ink-800/92"
                              : "fill-white/90 stroke-ink-950/15 hover:stroke-ink-950/40 dark:fill-ink-800/90 dark:stroke-white/15 dark:hover:stroke-white/40"
                    }`}
                    strokeWidth={lit ? 2 : 1.25}
                  />
                  {isMatched ? (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.r * 1.18 + 1}
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                      className="pointer-events-none stroke-accent-500/80"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                    />
                  ) : null}
                  {isSelected ? (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.r * 1.14 + 2}
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                      className="pointer-events-none stroke-accent-500/70"
                      strokeWidth={1.5}
                    />
                  ) : null}
                  {focusVisibleId === id ? (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.r * 1.1 + 2}
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                      className="pointer-events-none stroke-accent-500"
                      strokeWidth={2}
                    />
                  ) : null}
                  {isKeystone && !isFile ? (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.r * 1.12 + 1}
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                      className="pointer-events-none stroke-accent-400/50"
                      strokeWidth={1}
                      strokeDasharray="3 5"
                    />
                  ) : null}
                  {tier !== "dot" ? (
                    <text
                      x={node.x}
                      y={node.y + node.r + labelSize * 1.35}
                      textAnchor="middle"
                      fontSize={labelSize}
                      className={`pointer-events-none font-mono transition-colors duration-200 ${
                        lit
                          ? "fill-ink-950 font-semibold dark:fill-ink-50"
                          : isNeighbor
                            ? "fill-ink-800 dark:fill-ink-100"
                            : "fill-ink-600 dark:fill-ink-300"
                      }`}
                      stroke="var(--background)"
                      strokeWidth={labelSize * 0.3}
                      style={{ paintOrder: "stroke" }}
                    >
                      {node.name}
                    </text>
                  ) : null}
                  {tier === "detailed" && meta ? (
                    <text
                      x={node.x}
                      y={node.y + node.r + labelSize * 1.35 + metaSize * 1.5}
                      textAnchor="middle"
                      fontSize={metaSize}
                      className="pointer-events-none fill-ink-500 font-mono dark:fill-ink-400"
                      stroke="var(--background)"
                      strokeWidth={metaSize * 0.3}
                      style={{ paintOrder: "stroke" }}
                    >
                      {meta}
                    </text>
                  ) : null}
                  {!isFile && tier !== "dot" ? (
                    <text
                      x={node.x}
                      y={node.y + countSize * 0.36}
                      textAnchor="middle"
                      fontSize={countSize}
                      className="pointer-events-none fill-ink-500 font-mono dark:fill-ink-400"
                    >
                      {node.fileCount}
                    </text>
                  ) : null}
                </motion.g>
              );
            })}

            {/* The search pulse — a sonar ping on the node the map just
                flew to, so the landing spot is unmissable. */}
            {pulse && tiers.has(pulse.id)
              ? (() => {
                  const node = hierarchy.byId.get(pulse.id);
                  if (!node) return null;
                  return (
                    <circle
                      key={pulse.token}
                      cx={node.x}
                      cy={node.y}
                      r={node.r * 1.35 + 2}
                      fill="none"
                      vectorEffect="non-scaling-stroke"
                      className="graph-node-ripple pointer-events-none stroke-accent-500"
                      strokeWidth={2}
                    />
                  );
                })()
              : null}
          </motion.g>
        </svg>

        {selectedModule ? (
          <ModuleOverlay
            module={selectedModule}
            keystoneId={keystoneId}
            onSelect={onSelect}
            reduceMotion={Boolean(reduceMotion)}
          />
        ) : null}

        {/* The minimap earns its corner only when the map is big enough
            to get lost in. */}
        {hierarchy.byId.size > 30 ? (
          <Minimap hierarchy={hierarchy} tx={tx} ty={ty} zoom={zoom} setView={setView} />
        ) : null}

        <ViewControls
          zoomLabel={zoomLabel}
          onZoomIn={() => zoomBy(1.4)}
          onZoomOut={() => zoomBy(1 / 1.4)}
          onReset={() => {
            onSelect(null);
            homeView();
          }}
        />
      </div>
    </div>
  );
}

/** The whole world in a corner: the top-level shape plus a viewport
 * rectangle that tracks the springs directly, so it moves every frame
 * without a single React re-render. Click or drag to travel. */
function Minimap({
  hierarchy,
  tx,
  ty,
  zoom,
  setView,
}: {
  hierarchy: AtlasHierarchy;
  tx: MotionValue<number>;
  ty: MotionValue<number>;
  zoom: MotionValue<number>;
  setView: (next: { x: number; y: number; k: number }, jump: boolean) => void;
}) {
  const rectX = useTransform([tx, zoom], ([t, k]: number[]) => (0 - t) / k);
  const rectY = useTransform([ty, zoom], ([t, k]: number[]) => (0 - t) / k);
  const rectW = useTransform(zoom, (k) => VIEW_W / k);
  const rectH = useTransform(zoom, (k) => VIEW_H / k);

  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const travel = useCallback(
    (clientX: number, clientY: number, jump: boolean) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const wx = ((clientX - rect.left) / rect.width) * VIEW_W;
      const wy = ((clientY - rect.top) / rect.height) * VIEW_H;
      const k = zoom.get();
      setView({ k, x: VIEW_W / 2 - wx * k, y: VIEW_H / 2 - wy * k }, jump);
    },
    [setView, zoom],
  );

  return (
    <div className="glass-strong edge-light absolute bottom-4 right-4 hidden overflow-hidden rounded-xl p-1 md:block">
      <svg
        ref={ref}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="block h-[6.1rem] w-[9rem] cursor-pointer"
        role="img"
        aria-label="Minimap of the whole repository; the rectangle marks the current viewport. Click to travel."
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = true;
          travel(event.clientX, event.clientY, false);
        }}
        onPointerMove={(event) => {
          if (dragging.current) travel(event.clientX, event.clientY, true);
        }}
        onPointerUp={(event) => {
          dragging.current = false;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
      >
        {hierarchy.topIds.map((id) => {
          const node = hierarchy.byId.get(id);
          if (!node) return null;
          return (
            <circle
              key={id}
              cx={node.x}
              cy={node.y}
              r={node.r}
              className={
                id === hierarchy.keystoneTopId
                  ? "fill-accent-500/25 stroke-accent-500/60"
                  : "fill-ink-950/10 stroke-ink-950/25 dark:fill-white/10 dark:stroke-white/25"
              }
              strokeWidth={4}
            />
          );
        })}
        <motion.rect
          x={rectX}
          y={rectY}
          width={rectW}
          height={rectH}
          fill="rgb(46 107 255 / 0.08)"
          className="stroke-accent-500"
          strokeWidth={6}
          rx={8}
        />
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

function EdgeArrow({
  from,
  to,
  active,
  dimmed,
}: {
  from: AtlasNode;
  to: AtlasNode;
  active: boolean;
  dimmed: boolean;
}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const size = clamp(to.r * 0.32, 3.5, 12);
  const tipX = to.x - ux * (to.r + 2);
  const tipY = to.y - uy * (to.r + 2);
  const baseX = tipX - ux * size;
  const baseY = tipY - uy * size;
  const half = size * 0.46;
  const points = `${tipX},${tipY} ${baseX - uy * half},${baseY + ux * half} ${baseX + uy * half},${baseY - ux * half}`;
  return (
    <polygon
      points={points}
      className={active ? "fill-accent-500" : "fill-ink-950/25 dark:fill-white/25"}
      opacity={dimmed ? 0.14 : 1}
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
