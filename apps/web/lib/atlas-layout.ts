import dagre from "@dagrejs/dagre";
import {
  aggregateEdges,
  ancestorChain,
  type AtlasHierarchy,
  type AtlasNode,
} from "@/lib/atlas-hierarchy";

/** Turns a slice of the Atlas containment tree into a drawable diagram —
 * the layered, directional layout the redesign asked for in place of
 * the old circle-packing math. `atlas-hierarchy.ts` still owns identity
 * and containment (and still does all the honest aggregation-to-the-
 * visible-frontier work in `aggregateEdges`); this module only turns
 * one container's children, plus whatever real edges touch them, into
 * pixel geometry via `@dagrejs/dagre`.
 *
 * One dagre pass covers exactly one "layer" — the drill-down unit the
 * new interaction model is built around. Drilling into a card computes
 * a fresh layer for its children; there is deliberately no single
 * shared world coordinate space spanning the whole repository the way
 * the old circle-packing layout had one, because a layered DAG layout
 * of the *entire* tree at once is exactly the unreadable "everything at
 * full detail" result the redesign is trying to get away from. */

export type CardTier = "module" | "container" | "file";

export interface PositionedNode {
  id: string;
  node: AtlasNode;
  /** Top-left corner, in this layer's local pixel space. */
  x: number;
  y: number;
  width: number;
  height: number;
  tier: CardTier;
  /** A peer pulled in only because a real import edge touches it — not
   * a child of the open container, not drillable from here, dimmer by
   * default. Clicking one jumps the breadcrumb straight to it. */
  isPeer: boolean;
}

export interface RoutedEdge {
  key: string;
  sourceId: string;
  targetId: string;
  weight: number;
  path: string;
  arrowPoints: string;
  labelX: number;
  labelY: number;
  /** This edge runs against the layer's dominant top-to-bottom flow —
   * dagre had to break a real cycle to rank the graph. Real signal
   * (mirrors `ModuleFacts.inCycle`), not a routing bug; render it
   * distinctly rather than pretending the graph is a strict DAG. */
  reversed: boolean;
}

export interface AtlasLayer {
  containerId: string | null;
  nodes: PositionedNode[];
  edges: RoutedEdge[];
  width: number;
  height: number;
}

const RANKSEP = 76;
const NODESEP = 28;
const EDGESEP = 16;
const ARROW = 9;

function cardSize(node: AtlasNode, isPeer: boolean): { width: number; height: number } {
  const nameLen = node.name.length;
  const width = Math.min(248, Math.max(172, nameLen * 6.5 + 72));
  if (node.kind === "file") return { width: Math.min(width, 208), height: 40 };
  if (isPeer) return { width: Math.min(width, 208), height: 48 };
  if (node.kind === "module") return { width, height: 88 };
  return { width, height: 68 };
}

function cardTier(node: AtlasNode): CardTier {
  if (node.kind === "file") return "file";
  if (node.kind === "module") return "module";
  return "container";
}

/** Which of a layer's own rendered cards contains `nodeId` — the direct
 * child of `containerId` on `nodeId`'s ancestor path, or `nodeId`
 * itself when it already is that direct child. Used to resolve an
 * external selection (a module id from the tree pane, the keystone)
 * onto whichever card in the *current* layer should light up; returns
 * `null` when `nodeId` isn't under this layer at all. */
export function anchorAtLayer(
  hierarchy: AtlasHierarchy,
  containerId: string | null,
  nodeId: string,
): string | null {
  const chain = ancestorChain(hierarchy, nodeId);
  const found = chain.find((n) => n.parentId === containerId);
  return found?.id ?? null;
}

/** `isOpen` for this layer: everything on the path from the repository
 * root down to `containerId`, inclusive. Feeding that into the
 * unchanged `aggregateEdges` naturally produces "this layer's real
 * children" plus "whichever closed ancestor holds the other end of a
 * real import" — the external peers — with zero new aggregation logic. */
function openAncestorSet(hierarchy: AtlasHierarchy, containerId: string | null): Set<string> {
  const set = new Set<string>();
  if (containerId) {
    for (const node of ancestorChain(hierarchy, containerId)) set.add(node.id);
  }
  return set;
}

export function computeLayer(hierarchy: AtlasHierarchy, containerId: string | null): AtlasLayer {
  const childIds = containerId ? (hierarchy.byId.get(containerId)?.childIds ?? []) : hierarchy.topIds;
  const childSet = new Set(childIds);

  const open = openAncestorSet(hierarchy, containerId);
  const isOpen = (id: string) => open.has(id);
  const allEdges = aggregateEdges(hierarchy, isOpen);
  const relevant = allEdges.filter((e) => childSet.has(e.sourceId) || childSet.has(e.targetId));

  const peerIds = new Set<string>();
  for (const e of relevant) {
    if (!childSet.has(e.sourceId)) peerIds.add(e.sourceId);
    if (!childSet.has(e.targetId)) peerIds.add(e.targetId);
  }

  if (childIds.length === 0) {
    return { containerId, nodes: [], edges: [], width: 0, height: 0 };
  }

  const g = new dagre.graphlib.Graph({ directed: true });
  g.setGraph({ rankdir: "TB", nodesep: NODESEP, ranksep: RANKSEP, edgesep: EDGESEP, marginx: 32, marginy: 32 });
  g.setDefaultEdgeLabel(() => ({}));

  const allIds = [...childIds, ...peerIds];
  for (const id of allIds) {
    const node = hierarchy.byId.get(id);
    if (!node) continue;
    const size = cardSize(node, peerIds.has(id));
    g.setNode(id, size);
  }
  for (const e of relevant) {
    // A duplicate self-referencing edge (both ends collapse to the same
    // node once anchored) never happens post-`aggregateEdges` — it
    // already drops `sourceId === targetId` — but a defensive skip
    // costs nothing.
    if (e.sourceId === e.targetId) continue;
    g.setEdge(e.sourceId, e.targetId, { weight: Math.max(1, e.weight) });
  }

  dagre.layout(g);

  const positioned = new Map<string, PositionedNode>();
  for (const id of allIds) {
    const laid = g.node(id) as { x: number; y: number; width: number; height: number } | undefined;
    const atlasNode = hierarchy.byId.get(id);
    if (!laid || !atlasNode) continue;
    const isPeer = peerIds.has(id);
    positioned.set(id, {
      id,
      node: atlasNode,
      x: laid.x - laid.width / 2,
      y: laid.y - laid.height / 2,
      width: laid.width,
      height: laid.height,
      tier: cardTier(atlasNode),
      isPeer,
    });
  }

  const edges: RoutedEdge[] = [];
  for (const e of relevant) {
    const source = positioned.get(e.sourceId);
    const target = positioned.get(e.targetId);
    if (!source || !target) continue;
    edges.push(routeEdge(e.key, e.sourceId, e.targetId, e.weight, source, target));
  }

  const graphLabel = g.graph() as { width?: number; height?: number };
  return {
    containerId,
    nodes: [...positioned.values()],
    edges,
    width: graphLabel.width ?? 0,
    height: graphLabel.height ?? 0,
  };
}

interface Point {
  x: number;
  y: number;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function cubicPath(p0: Point, p1: Point, p2: Point, p3: Point): string {
  return `M ${round(p0.x)} ${round(p0.y)} C ${round(p1.x)} ${round(p1.y)}, ${round(p2.x)} ${round(p2.y)}, ${round(p3.x)} ${round(p3.y)}`;
}

function cubicPointAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** A triangle pointing along (dx, dy), tip at (tipX, tipY) — the same
 * hand-drawn arrowhead technique the old circle-rim edges used,
 * generalized to whatever direction the bezier actually approaches from
 * rather than assuming "downward." */
function arrowPolygon(tipX: number, tipY: number, dx: number, dy: number, size: number): string {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const baseX = tipX - ux * size;
  const baseY = tipY - uy * size;
  const half = size * 0.46;
  const p1x = baseX - uy * half;
  const p1y = baseY + ux * half;
  const p2x = baseX + uy * half;
  const p2y = baseY - ux * half;
  return `${round(tipX)},${round(tipY)} ${round(p1x)},${round(p1y)} ${round(p2x)},${round(p2y)}`;
}

/** dagre's raw `points` are routing scaffolding (they thread through
 * dummy nodes for long multi-rank edges), not a curve worth drawing
 * directly. Instead: read only the rank relationship between the two
 * cards and construct one clean cubic S-curve between their rectangle
 * edges — top-to-bottom for the dominant flow direction, routed around
 * the side for anything dagre had to rank backward (a real cycle) or
 * left at the same rank. */
function routeEdge(
  key: string,
  sourceId: string,
  targetId: string,
  weight: number,
  source: PositionedNode,
  target: PositionedNode,
): RoutedEdge {
  const scx = source.x + source.width / 2;
  const scy = source.y + source.height / 2;
  const tcx = target.x + target.width / 2;
  const tcy = target.y + target.height / 2;
  const dy = tcy - scy;
  const dx = tcx - scx;

  let p0: Point;
  let p3: Point;
  let c1: Point;
  let c2: Point;
  const reversed = dy <= 20;

  if (!reversed) {
    // Forward: exits the source's bottom edge, enters the target's top.
    p0 = { x: scx, y: source.y + source.height };
    p3 = { x: tcx, y: target.y - ARROW };
    const bow = Math.max(28, (p3.y - p0.y) / 2);
    c1 = { x: p0.x, y: p0.y + bow };
    c2 = { x: p3.x, y: p3.y - bow };
  } else {
    // Same rank, or a cycle dagre had to rank backward: loop out the
    // near side instead of drawing straight through both cards.
    const goRight = dx >= 0;
    p0 = { x: goRight ? source.x + source.width : source.x, y: scy };
    const rawEntryX = goRight ? target.x + target.width : target.x;
    p3 = { x: rawEntryX + (goRight ? ARROW : -ARROW), y: tcy };
    const bow = Math.max(56, Math.abs(p3.x - p0.x) * 0.55);
    const dir = goRight ? 1 : -1;
    c1 = { x: p0.x + dir * bow, y: p0.y };
    c2 = { x: p3.x + dir * bow, y: p3.y };
  }

  const path = cubicPath(p0, c1, c2, p3);
  const arrowPoints = arrowPolygon(p3.x, p3.y, p3.x - c2.x, p3.y - c2.y, ARROW);
  const mid = cubicPointAt(p0, c1, c2, p3, 0.5);

  return {
    key,
    sourceId,
    targetId,
    weight,
    path,
    arrowPoints,
    labelX: mid.x,
    labelY: mid.y,
    reversed,
  };
}
