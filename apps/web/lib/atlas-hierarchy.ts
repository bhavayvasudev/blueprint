import type { ModuleFacts } from "@/lib/insights";

/** The Atlas's level-of-detail model — the repository as a containment
 * hierarchy rather than a flat constellation.
 *
 * Every level is real structure, never invention: domains are the
 * repository's actual top-level directories, modules are the boundaries
 * Stage 3 rolled up on the backend, folders and files are the paths the
 * study read. The hierarchy exists so the map can practice progressive
 * disclosure — the first screen shows only the top level, and zooming
 * in opens containers the way a map resolves countries into cities —
 * without the underlying data ever being simplified or faked.
 *
 * Import edges exist only at module level (that is the only level the
 * backend measured), so when a container is closed the edges that cross
 * its boundary are *aggregated*, each carrying the count of real
 * module-to-module import paths it stands for. Files never grow edges:
 * membership inside their module's circle is the honest statement of
 * what we know about them. */

export type AtlasNodeKind = "domain" | "module" | "folder" | "file";

export interface AtlasNode {
  id: string;
  kind: AtlasNodeKind;
  /** Display name: this node's path relative to its parent, so a
   * contracted chain reads as "apps/api" rather than two hops. */
  name: string;
  /** Full repository path. The root module ("."), if present, keeps ".". */
  path: string;
  fileCount: number;
  /** Module boundaries at or beneath this node. */
  moduleCount: number;
  depth: number;
  parentId: string | null;
  childIds: string[];
  /** Every module id at or beneath this node — for a folder or file
   * inside a module, the owning module's id. Focus mode and the
   * explorer's selection both map through this. */
  moduleIds: string[];
  /** Set only on module nodes. */
  module: ModuleFacts | null;
  /** Laid out once, in absolute world coordinates — the whole tree has
   * fixed positions and the viewport does all the moving. */
  x: number;
  y: number;
  r: number;
}

export interface AggregatedEdge {
  key: string;
  sourceId: string;
  targetId: string;
  /** How many real module→module import paths this strand stands for. */
  weight: number;
}

export interface AtlasHierarchy {
  topIds: string[];
  byId: Map<string, AtlasNode>;
  /** module id → node id (identical strings today, kept explicit so the
   * contract survives if node ids ever diverge). */
  nodeIdOfModule: Map<string, string>;
  /** The raw module-level import edges, by node id. */
  moduleEdges: { source: string; target: string }[];
  /** Top-level node containing the keystone module, if any. */
  keystoneTopId: string | null;
  /** Deep enough that the smallest file node reaches a readable size. */
  maxZoom: number;
  totalFiles: number;
}

// ——— world constants (shared with AtlasGraph) ———
export const ATLAS_VIEW_W = 880;
export const ATLAS_VIEW_H = 600;

const FILE_R = 10;

interface RawNode {
  name: string;
  path: string;
  isFile: boolean;
  children: Map<string, RawNode>;
  module: ModuleFacts | null;
}

function makeRaw(name: string, path: string, isFile: boolean): RawNode {
  return { name, path, isFile, children: new Map(), module: null };
}

/** Mirrors the backend's `_module_key_for_file` the same way the
 * explorer's `resolveModule` does: a file belongs to the nearest
 * ancestor directory that is a module boundary, falling back to the
 * root module (".") when no ancestor matches. */
function moduleForFile(path: string, byLabel: Map<string, ModuleFacts>): ModuleFacts | null {
  const parts = path.split("/");
  const dirParts = parts.slice(0, -1);
  for (let depth = dirParts.length; depth > 0; depth -= 1) {
    const found = byLabel.get(dirParts.slice(0, depth).join("/"));
    if (found) return found;
  }
  return byLabel.get(".") ?? null;
}

export function buildAtlasHierarchy(
  modules: ModuleFacts[],
  filePaths: string[],
  keystoneId: string | null,
): AtlasHierarchy {
  const byLabel = new Map(modules.map((m) => [m.label, m]));

  // ——— segment tree over every file path ———
  const root = makeRaw("", "", false);
  for (const filePath of filePaths) {
    const parts = filePath.split("/");
    let cursor = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const key = `${isFile ? "f" : "d"}:${part}`;
      let child = cursor.children.get(key);
      if (!child) {
        child = makeRaw(part, parts.slice(0, index + 1).join("/"), isFile);
        cursor.children.set(key, child);
      }
      cursor = child;
    });
  }

  // ——— mark module boundaries on their directory nodes ———
  for (const m of modules) {
    if (m.label === ".") continue; // handled below — the root module is files, not the repo
    const parts = m.label.split("/");
    let cursor = root;
    for (const [index, part] of parts.entries()) {
      const key = `d:${part}`;
      let child = cursor.children.get(key);
      if (!child) {
        child = makeRaw(part, parts.slice(0, index + 1).join("/"), false);
        cursor.children.set(key, child);
      }
      cursor = child;
    }
    cursor.module = m;
  }

  // The root module (".") is the boundary the backend gives loose
  // top-level files. It becomes a real sibling of the top-level
  // directories, holding exactly those files.
  const rootModule = byLabel.get(".") ?? null;
  if (rootModule) {
    const dot = makeRaw(".", ".", false);
    dot.module = rootModule;
    for (const [key, child] of [...root.children]) {
      if (child.isFile) {
        dot.children.set(key, child);
        root.children.delete(key);
      }
    }
    root.children.set("d:.", dot);
  }

  // ——— convert, contracting single-child directory chains ———
  const byId = new Map<string, AtlasNode>();
  const nodeIdOfModule = new Map<string, string>();

  interface Rollup {
    fileCount: number;
    moduleCount: number;
    moduleIds: string[];
  }

  function convert(
    raw: RawNode,
    parentPath: string,
    parentId: string | null,
    depth: number,
    owningModule: ModuleFacts | null,
  ): { node: AtlasNode; rollup: Rollup } {
    // Contract: a directory that is not itself a module and holds
    // exactly one subdirectory (and nothing else) is a corridor, not a
    // place — walk through it so `apps` with only `apps/api` inside
    // reads as one node named "apps/api".
    let cur = raw;
    while (!cur.isFile && !cur.module && cur.children.size === 1) {
      const only = [...cur.children.values()][0]!;
      if (only.isFile) break;
      cur = only;
    }

    const relName =
      parentPath && cur.path.startsWith(`${parentPath}/`)
        ? cur.path.slice(parentPath.length + 1)
        : cur.path || cur.name;

    if (cur.isFile) {
      const owner = owningModule ?? moduleForFile(cur.path, byLabel);
      const node: AtlasNode = {
        id: `f:${cur.path}`,
        kind: "file",
        name: relName,
        path: cur.path,
        fileCount: 1,
        moduleCount: 0,
        depth,
        parentId,
        childIds: [],
        moduleIds: owner ? [owner.id] : [],
        module: null,
        x: 0,
        y: 0,
        r: FILE_R,
      };
      byId.set(node.id, node);
      return { node, rollup: { fileCount: 1, moduleCount: 0, moduleIds: node.moduleIds } };
    }

    const isModule = cur.module !== null;
    const nextOwner = cur.module ?? owningModule;
    const id = isModule ? cur.module!.id : `p:${cur.path}`;
    const kind: AtlasNodeKind = isModule ? "module" : nextOwner ? "folder" : "domain";

    const node: AtlasNode = {
      id,
      kind,
      name: relName,
      path: cur.path,
      fileCount: 0,
      moduleCount: isModule ? 1 : 0,
      depth,
      parentId,
      childIds: [],
      moduleIds: [],
      module: cur.module,
      x: 0,
      y: 0,
      r: 0,
    };
    byId.set(id, node);
    if (isModule) nodeIdOfModule.set(cur.module!.id, id);

    let fileCount = 0;
    let moduleCount = isModule ? 1 : 0;
    const moduleIds = new Set<string>(isModule ? [cur.module!.id] : []);
    const children: AtlasNode[] = [];
    for (const childRaw of cur.children.values()) {
      const { node: child, rollup } = convert(childRaw, cur.path, id, depth + 1, nextOwner);
      children.push(child);
      fileCount += rollup.fileCount;
      moduleCount += rollup.moduleCount;
      for (const mid of rollup.moduleIds) moduleIds.add(mid);
    }
    // Folders and files inside a module inherit the owner so selection
    // and focus can always resolve to a module; the module node itself
    // rolls up everything beneath.
    if (nextOwner && !isModule) moduleIds.add(nextOwner.id);

    // Deterministic order: heaviest first (better packing), name as the
    // tiebreak so the same repository always draws the same map.
    children.sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name));
    node.childIds = children.map((c) => c.id);
    node.fileCount = fileCount;
    node.moduleCount = moduleCount;
    node.moduleIds = [...moduleIds];
    return { node, rollup: { fileCount, moduleCount, moduleIds: node.moduleIds } };
  }

  const topNodes: AtlasNode[] = [];
  for (const childRaw of root.children.values()) {
    const { node } = convert(childRaw, "", null, 0, null);
    topNodes.push(node);
  }
  topNodes.sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name));

  // A module the rollup produced but no file path reached (possible when
  // metadata and the path list drift) still deserves a node.
  for (const m of modules) {
    if (!nodeIdOfModule.has(m.id)) {
      const node: AtlasNode = {
        id: m.id,
        kind: "module",
        name: m.label,
        path: m.label,
        fileCount: m.fileCount,
        moduleCount: 1,
        depth: 0,
        parentId: null,
        childIds: [],
        moduleIds: [m.id],
        module: m,
        x: 0,
        y: 0,
        r: 0,
      };
      byId.set(node.id, node);
      nodeIdOfModule.set(m.id, node.id);
      topNodes.push(node);
    }
  }

  // ——— layout: bottom-up packing, then a top ring, then normalize ———
  layoutInto(topNodes, byId);

  const keystoneTopId = keystoneId
    ? (topNodes.find((n) => n.moduleIds.includes(keystoneId))?.id ?? null)
    : null;
  placeTopLevel(topNodes, keystoneTopId);
  const minR = normalize(topNodes, byId);

  // ——— module-level edges, by node id ———
  const moduleEdges: { source: string; target: string }[] = [];
  for (const m of modules) {
    const source = nodeIdOfModule.get(m.id);
    if (!source) continue;
    for (const dep of m.dependsOn) {
      const target = nodeIdOfModule.get(dep.id);
      if (target && target !== source) moduleEdges.push({ source, target });
    }
  }

  return {
    topIds: topNodes.map((n) => n.id),
    byId,
    nodeIdOfModule,
    moduleEdges,
    keystoneTopId,
    maxZoom: clampValue(30 / Math.max(minR, 0.001), 8, 800),
    totalFiles: filePaths.length,
  };
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Recursive packing: each container's children are placed around its
 * center (a ring for a few, a sunflower spiral for many), and the
 * container's radius grows to hold them. Positions are relative to the
 * container here; `resolveAbsolute` shifts them into world space. */
function layoutInto(topNodes: AtlasNode[], byId: Map<string, AtlasNode>): void {
  function layout(node: AtlasNode): void {
    if (node.kind === "file") {
      node.r = FILE_R;
      return;
    }
    const children = node.childIds.map((id) => byId.get(id)!);
    for (const child of children) layout(child);

    if (children.length === 0) {
      node.r = Math.max(18, 15 + Math.sqrt(node.fileCount) * 2);
      return;
    }
    if (children.length === 1) {
      const child = children[0]!;
      child.x = 0;
      child.y = 0;
      node.r = child.r * 1.5 + 14;
      return;
    }

    if (children.length <= 8) {
      // Ring: radius from circumferential packing so neighbours clear
      // each other, alternating radial jitter so it reads as a
      // constellation rather than a gear.
      const maxR = Math.max(...children.map((c) => c.r));
      const circumference = children.reduce((sum, c) => sum + c.r * 2, 0) * 1.35;
      const R = Math.max(circumference / (Math.PI * 2), maxR * 1.75);
      children.forEach((child, i) => {
        const angle = -Math.PI / 2 + ((i + 0.5) / children.length) * Math.PI * 2;
        const jitter = i % 2 === 0 ? 0.92 : 1.08;
        child.x = Math.cos(angle) * R * jitter;
        child.y = Math.sin(angle) * R * jitter;
      });
      node.r = R * 1.08 + maxR + Math.max(10, maxR * 0.3);
      return;
    }

    // Sunflower spiral, heaviest at the center. The k-th child sits at a
    // radius derived from the cumulative area already placed, which
    // keeps mixed sizes from overlapping without a physics pass.
    const golden = Math.PI * (3 - Math.sqrt(5));
    let area = 0;
    let extent = 0;
    children.forEach((child, i) => {
      area += child.r * child.r * 5.4;
      const d = i === 0 ? 0 : Math.sqrt(area);
      child.x = Math.cos(i * golden) * d;
      child.y = Math.sin(i * golden) * d;
      extent = Math.max(extent, d + child.r);
    });
    node.r = extent + Math.max(10, extent * 0.12);
  }

  for (const node of topNodes) layout(node);
}

/** The overview ring: the top-level node containing the keystone holds
 * the center (the map's center of gravity is real, not aesthetic), and
 * every other domain sits on an ellipse around it. */
function placeTopLevel(topNodes: AtlasNode[], keystoneTopId: string | null): void {
  if (topNodes.length === 0) return;
  const centerNode =
    topNodes.find((n) => n.id === keystoneTopId) ?? topNodes[0]!;
  const others = topNodes.filter((n) => n.id !== centerNode.id);
  centerNode.x = 0;
  centerNode.y = 0;
  if (others.length === 0) return;

  const maxOtherR = Math.max(...others.map((n) => n.r));
  const circumference = others.reduce((sum, n) => sum + n.r * 2, 0) * 1.4;
  const R = Math.max(
    centerNode.r + maxOtherR + Math.max(40, centerNode.r * 0.35),
    circumference / (Math.PI * 2),
  );
  others.forEach((node, i) => {
    const angle = -Math.PI / 2 + ((i + 0.5) / others.length) * Math.PI * 2;
    const jitter = i % 2 === 0 ? 0.94 : 1.06;
    node.x = Math.cos(angle) * R * 1.12 * jitter;
    node.y = Math.sin(angle) * R * 0.82 * jitter;
  });
}

/** Uniform-scale the whole world into the viewBox so the home view is
 * the overview. Children were laid out relative to their parents;
 * this pass makes every coordinate absolute, then scales. Returns the
 * smallest node radius after scaling (it bounds the useful max zoom). */
function normalize(topNodes: AtlasNode[], byId: Map<string, AtlasNode>): number {
  // Absolute positions first.
  function resolveAbsolute(node: AtlasNode, ox: number, oy: number): void {
    node.x += ox;
    node.y += oy;
    for (const id of node.childIds) resolveAbsolute(byId.get(id)!, node.x, node.y);
  }
  for (const node of topNodes) resolveAbsolute(node, 0, 0);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of topNodes) {
    minX = Math.min(minX, node.x - node.r);
    maxX = Math.max(maxX, node.x + node.r);
    minY = Math.min(minY, node.y - node.r);
    maxY = Math.max(maxY, node.y + node.r);
  }
  const pad = 52;
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const s = Math.min((ATLAS_VIEW_W - pad * 2) / spanX, (ATLAS_VIEW_H - pad * 2) / spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  let minR = Infinity;
  for (const node of byId.values()) {
    node.x = ATLAS_VIEW_W / 2 + (node.x - cx) * s;
    node.y = ATLAS_VIEW_H / 2 + (node.y - cy) * s;
    node.r = Math.max(node.r * s, 0.35);
    minR = Math.min(minR, node.r);
  }
  return minR;
}

/** The chain of ancestors from a top-level node down to `nodeId`,
 * inclusive. */
export function ancestorChain(h: AtlasHierarchy, nodeId: string): AtlasNode[] {
  const chain: AtlasNode[] = [];
  let cur = h.byId.get(nodeId);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? h.byId.get(cur.parentId) : undefined;
  }
  return chain;
}

/** Where an import edge lands while some containers are closed: the
 * first *closed* container on the way down, or the node itself when
 * everything above it is open. This is the map's honesty rule — an edge
 * only ever attaches to something actually on screen. */
export function anchorOf(
  h: AtlasHierarchy,
  nodeId: string,
  isOpen: (id: string) => boolean,
): string {
  const chain = ancestorChain(h, nodeId);
  for (const node of chain) {
    if (!isOpen(node.id)) return node.id;
  }
  return nodeId;
}

/** Aggregate the real module→module import edges up to the currently
 * visible frontier. A strand between two closed domains carries the
 * count of underlying import paths; expanding either side re-runs this
 * and the strand resolves into its parts. */
export function aggregateEdges(
  h: AtlasHierarchy,
  isOpen: (id: string) => boolean,
): AggregatedEdge[] {
  const anchorCache = new Map<string, string>();
  const anchor = (id: string): string => {
    let cached = anchorCache.get(id);
    if (!cached) {
      cached = anchorOf(h, id, isOpen);
      anchorCache.set(id, cached);
    }
    return cached;
  };

  const byKey = new Map<string, AggregatedEdge>();
  for (const edge of h.moduleEdges) {
    const sourceId = anchor(edge.source);
    const targetId = anchor(edge.target);
    if (sourceId === targetId) continue;
    const key = `${sourceId}->${targetId}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.weight += 1;
    } else {
      byKey.set(key, { key, sourceId, targetId, weight: 1 });
    }
  }
  return [...byKey.values()];
}
