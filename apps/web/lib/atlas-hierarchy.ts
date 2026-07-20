import type { ModuleFacts } from "@/lib/insights";

/** The Atlas's containment model — the repository as a hierarchy rather
 * than a flat constellation.
 *
 * Every level is real structure, never invention: domains are the
 * repository's actual top-level directories, modules are the boundaries
 * Stage 3 rolled up on the backend, folders and files are the paths the
 * study read. The hierarchy exists so the map can practice progressive
 * disclosure — the first screen shows only the top level, and drilling
 * in opens containers the way an IDE's package explorer resolves a
 * directory into its children — without the underlying data ever being
 * simplified or faked.
 *
 * Import edges exist only at module level (that is the only level the
 * backend measured), so when a container is closed the edges that cross
 * its boundary are *aggregated*, each carrying the count of real
 * module-to-module import paths it stands for. Files never grow edges:
 * membership inside their module's card is the honest statement of what
 * we know about them.
 *
 * This module owns identity and containment only. Geometry — where a
 * node actually sits on screen — is a separate, per-layer concern
 * computed by `atlas-layout.ts` from whichever slice of this tree is
 * currently open, not stored here. */

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
  totalFiles: number;
}

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
      };
      byId.set(node.id, node);
      nodeIdOfModule.set(m.id, node.id);
      topNodes.push(node);
    }
  }

  const keystoneTopId = keystoneId
    ? (topNodes.find((n) => n.moduleIds.includes(keystoneId))?.id ?? null)
    : null;

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
    totalFiles: filePaths.length,
  };
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
