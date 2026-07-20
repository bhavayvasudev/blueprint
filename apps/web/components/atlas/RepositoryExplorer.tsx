"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { AtlasGraph } from "@/components/atlas/AtlasGraph";
import { IconChevronDown, IconFile, IconFolder, IconPin } from "@/components/workspace/icons";
import type { ModuleFacts } from "@/lib/insights";
import { useExplorerState, type ExplorerControls } from "@/lib/use-explorer-state";

/** The Atlas: structure on the left, architecture on the right.
 *
 * Left is the repository as a *place* — backend, frontend, docs,
 * scripts, shared — collapsed to its top level, closer to the VS Code
 * explorer than to a graph visualizer. Right is the repository as a
 * *system*: the complete architecture map, always drawn, always the
 * whole graph.
 *
 * The two are one instrument. Selecting in the tree doesn't swap the
 * right pane for a different view — it re-reads the map already there,
 * lighting the chosen boundary and its import strands and fading the
 * rest. A container folder like `apps/` lights every boundary beneath
 * it, so the graph is its own chooser. Clicking a node runs the same
 * wire backwards and moves the tree's selection. Nothing about the
 * experience is replaced by a selection; only what's emphasised changes.
 *
 * The tree column is a fixed width and scrolls inside itself, so
 * expanding a folder never moves the pane beside it (the brief: "never
 * shift page layout"). */

interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: TreeNode[];
  /** Files anywhere beneath this node — the number a folder row shows. */
  fileCount: number;
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isFile: false, children: [], fileCount: 0 };
  for (const path of paths) {
    const parts = path.split("/");
    let cursor = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      let node = cursor.children.find((child) => child.name === part && child.isFile === isFile);
      if (!node) {
        node = {
          name: part,
          path: parts.slice(0, index + 1).join("/"),
          isFile,
          children: [],
          fileCount: 0,
        };
        cursor.children.push(node);
      }
      cursor = node;
    });
  }
  const tally = (node: TreeNode): number => {
    node.fileCount = node.isFile
      ? 1
      : node.children.reduce((total, child) => total + tally(child), 0);
    return node.fileCount;
  };
  const sort = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sort);
  };
  root.children.forEach(tally);
  sort(root);
  return root.children;
}

/** The module boundary a path belongs to: the nearest ancestor directory
 * that Stage 3 rolled up into a module, mirroring the backend's own
 * `_module_key_for_file`. A file resolves through its parent directory,
 * so clicking a file answers "what does the thing containing this
 * import?" rather than nothing at all.
 *
 * Only ancestors count. A container like `apps/` is not itself a module
 * and must not silently resolve to the repository-root module — it holds
 * several boundaries, and saying which is the caller's job. */
function resolveModule(
  path: string,
  isFile: boolean,
  byLabel: Map<string, ModuleFacts>,
): ModuleFacts | null {
  const parts = path.split("/");
  const dirParts = isFile ? parts.slice(0, -1) : parts;
  for (let depth = dirParts.length; depth > 0; depth -= 1) {
    const found = byLabel.get(dirParts.slice(0, depth).join("/"));
    if (found) return found;
  }
  return isFile ? (byLabel.get(".") ?? null) : null;
}

/** The module boundaries living beneath a container folder. */
function modulesUnder(path: string, modules: ModuleFacts[]): ModuleFacts[] {
  return modules.filter((module) => module.label.startsWith(`${path}/`));
}

export function RepositoryExplorer({
  repositoryId,
  filePaths,
  modules,
  keystoneId,
  initialFocusId,
}: {
  repositoryId: string;
  filePaths: string[];
  modules: ModuleFacts[];
  keystoneId: string | null;
  initialFocusId: string | null;
}) {
  const tree = useMemo(() => buildTree(filePaths), [filePaths]);
  const modulesByLabel = useMemo(
    () => new Map(modules.map((module) => [module.label, module])),
    [modules],
  );
  const moduleRoots = useMemo(() => new Set(modules.map((module) => module.label)), [modules]);

  // Top level open, everything below it closed — the first screen is the
  // shape of the repository, not its contents.
  const defaultExpanded = useMemo(
    () => tree.filter((node) => !node.isFile).map((node) => node.path),
    [tree],
  );
  const explorer = useExplorerState(repositoryId, defaultExpanded);

  // A deep link (?focus=) still lands on a module — the URL contract the
  // Briefing and the command palette already write against.
  const focusedModule = initialFocusId
    ? (modules.find((module) => module.id === initialFocusId) ?? null)
    : null;
  const [selectedPath, setSelectedPath] = useState<string | null>(focusedModule?.label ?? null);
  const [selectedIsFile, setSelectedIsFile] = useState(false);

  const selectedModule = selectedPath
    ? resolveModule(selectedPath, selectedIsFile, modulesByLabel)
    : null;
  // A container folder — `apps/`, `packages/` — holds boundaries without
  // being one. It gets a chooser, not a wrong answer.
  const containedModules = useMemo(
    () =>
      selectedPath && !selectedIsFile && !selectedModule
        ? modulesUnder(selectedPath, modules)
        : [],
    [selectedPath, selectedIsFile, selectedModule, modules],
  );
  const containedModuleIds = useMemo(
    () => containedModules.map((module) => module.id),
    [containedModules],
  );

  const select = useCallback((node: TreeNode) => {
    setSelectedPath(node.path);
    setSelectedIsFile(node.isFile);
  }, []);

  /** The folders that must be open for `path` to have a visible row —
   * every ancestor directory, plus the folder itself when the selection
   * is a folder (a place chosen on the map should show its contents). */
  const expandTo = useCallback(
    (path: string, isFile: boolean) => {
      if (path === "." || path === "") return;
      const parts = path.split("/");
      const dirDepth = isFile ? parts.length - 1 : parts.length;
      const paths: string[] = [];
      for (let depth = 1; depth <= dirDepth; depth += 1) {
        paths.push(parts.slice(0, depth).join("/"));
      }
      explorer.expandPaths(paths);
    },
    [explorer],
  );

  /** The graph selecting back into the tree. A node is a module, and a
   * module's label *is* its path, so the two panes share one selection
   * rather than keeping two that can drift. */
  const selectModuleId = useCallback(
    (id: string | null) => {
      if (id === null) {
        setSelectedPath(null);
        setSelectedIsFile(false);
        return;
      }
      const picked = modules.find((candidate) => candidate.id === id);
      if (!picked) return;
      setSelectedPath(picked.label);
      setSelectedIsFile(false);
      expandTo(picked.label, false);
    },
    [modules, expandTo],
  );

  /** The map choosing a non-module place — a domain, folder, or file.
   * The tree mirrors it and opens down to the row, so the two panes
   * stay one instrument at every level of detail. */
  const selectGraphPath = useCallback(
    (path: string, isFile: boolean) => {
      setSelectedPath(path === "" ? null : path);
      setSelectedIsFile(isFile);
      expandTo(path, isFile);
    },
    [expandTo],
  );

  // What the header says while a region is in focus — the selected path
  // and how it relates to the boundary the map is actually lighting.
  const contextLabel = selectedModule
    ? selectedPath === selectedModule.label
      ? `${selectedModule.label} · ${selectedModule.fileCount} ${selectedModule.fileCount === 1 ? "file" : "files"}`
      : `${selectedPath} · inside ${selectedModule.label}`
    : containedModules.length > 0
      ? `${selectedPath} · ${containedModules.length} ${containedModules.length === 1 ? "boundary" : "boundaries"}`
      : selectedPath !== null
        ? `${selectedPath} · outside every module boundary`
        : null;

  const pinnedNodes = useMemo(() => {
    if (explorer.pinned.length === 0) return [];
    const byPath = new Map<string, TreeNode>();
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        byPath.set(node.path, node);
        walk(node.children);
      }
    };
    walk(tree);
    return explorer.pinned
      .map((path) => byPath.get(path))
      .filter((node): node is TreeNode => node !== undefined);
  }, [explorer.pinned, tree]);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[21rem_minmax(0,1fr)]">
      <div className="glass edge-light flex flex-col overflow-hidden rounded-[2rem] xl:sticky xl:top-24">
        <div className="flex items-baseline justify-between gap-3 border-b border-ink-950/8 px-5 py-4 dark:border-white/8">
          <h2 className="text-sm font-medium text-ink-950 dark:text-ink-50">
            Repository structure
          </h2>
          <span className="font-mono text-xs text-ink-500 dark:text-ink-400">
            {filePaths.length} files
          </span>
        </div>

        {pinnedNodes.length > 0 ? (
          <div className="border-b border-ink-950/8 px-2 py-2 dark:border-white/8">
            <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-ink-400 dark:text-ink-500">
              Pinned
            </p>
            {pinnedNodes.map((node) => (
              <Row
                key={`pinned-${node.path}`}
                node={node}
                depth={0}
                isModuleRoot={moduleRoots.has(node.path)}
                isSelected={selectedPath === node.path}
                isExpanded={false}
                isPinned
                hasChildren={false}
                onSelect={select}
                onToggle={() => {}}
                onTogglePin={explorer.togglePinned}
              />
            ))}
          </div>
        ) : null}

        {/* Scrolls inside itself: a deep expansion never grows the page
            or nudges the pane beside it. */}
        <div className="max-h-[32rem] overflow-y-auto overscroll-contain px-2 py-2 xl:max-h-[calc(100vh-16rem)]">
          <TreeRows
            nodes={tree}
            depth={0}
            moduleRoots={moduleRoots}
            selectedPath={selectedPath}
            explorer={explorer}
            onSelect={select}
          />
        </div>
      </div>

      {/* The architecture, always. With nothing selected this is the
          complete repository graph at its home view; a selection moves
          and narrows it rather than replacing it. */}
      <div className="h-[30rem] sm:h-[38rem] xl:sticky xl:top-24 xl:h-[calc(100vh-16rem)]">
        <AtlasGraph
          modules={modules}
          filePaths={filePaths}
          keystoneId={keystoneId}
          selectedId={selectedModule?.id ?? null}
          highlightIds={containedModuleIds}
          contextLabel={contextLabel}
          onSelect={selectModuleId}
          onSelectPath={selectGraphPath}
        />
      </div>
    </div>
  );
}

function TreeRows({
  nodes,
  depth,
  moduleRoots,
  selectedPath,
  explorer,
  onSelect,
}: {
  nodes: TreeNode[];
  depth: number;
  moduleRoots: Set<string>;
  selectedPath: string | null;
  explorer: ExplorerControls;
  onSelect: (node: TreeNode) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <>
      {nodes.map((node) => {
        const expanded = !node.isFile && explorer.isExpanded(node.path);
        return (
          <div key={node.path}>
            <Row
              node={node}
              depth={depth}
              isModuleRoot={moduleRoots.has(node.path)}
              isSelected={selectedPath === node.path}
              isExpanded={expanded}
              isPinned={explorer.isPinned(node.path)}
              hasChildren={node.children.length > 0}
              onSelect={onSelect}
              onToggle={explorer.toggleExpanded}
              onTogglePin={explorer.togglePinned}
            />
            <AnimatePresence initial={false}>
              {expanded && node.children.length > 0 ? (
                <motion.div
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{
                    height: { type: "spring", stiffness: 420, damping: 38, mass: 0.7 },
                    opacity: { duration: 0.16 },
                  }}
                  className="overflow-hidden"
                >
                  <TreeRows
                    nodes={node.children}
                    depth={depth + 1}
                    moduleRoots={moduleRoots}
                    selectedPath={selectedPath}
                    explorer={explorer}
                    onSelect={onSelect}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </>
  );
}

function Row({
  node,
  depth,
  isModuleRoot,
  isSelected,
  isExpanded,
  isPinned,
  hasChildren,
  onSelect,
  onToggle,
  onTogglePin,
}: {
  node: TreeNode;
  depth: number;
  isModuleRoot: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  isPinned: boolean;
  hasChildren: boolean;
  onSelect: (node: TreeNode) => void;
  onToggle: (path: string) => void;
  onTogglePin: (path: string) => void;
}) {
  return (
    <div
      className={`group relative flex items-center gap-1 rounded-lg pr-1 transition-colors ${
        isSelected
          ? "bg-accent-500/10 text-ink-950 dark:text-ink-50"
          : "text-ink-700 hover:bg-ink-950/4 dark:text-ink-300 dark:hover:bg-white/6"
      }`}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      {/* Disclosure and selection are separate targets: opening a folder
          to look inside is not the same act as asking what it depends on. */}
      {node.isFile ? (
        <span className="w-5 shrink-0" aria-hidden />
      ) : (
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.name}`}
          className="flex w-5 shrink-0 items-center justify-center py-1.5 text-ink-400 hover:text-ink-700 dark:text-ink-500 dark:hover:text-ink-200"
        >
          {hasChildren ? (
            <IconChevronDown
              className={`h-3 w-3 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
            />
          ) : null}
        </button>
      )}

      <button
        type="button"
        onClick={() => onSelect(node)}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
      >
        {node.isFile ? (
          <IconFile className="h-3.5 w-3.5 shrink-0 text-ink-400 dark:text-ink-500" />
        ) : (
          <IconFolder
            className={`h-3.5 w-3.5 shrink-0 ${
              isModuleRoot ? "text-accent-500" : "text-ink-400 dark:text-ink-500"
            }`}
          />
        )}
        <span className="truncate font-mono text-xs">{node.name}</span>
        {/* Module roots carry a word, not just an accent color — color is
            never the sole signal (RULES.md §16). */}
        {isModuleRoot ? (
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-accent-600 dark:text-accent-400">
            module
          </span>
        ) : null}
      </button>

      {/* Both slots are fixed-width and always occupied, so a row never
          reflows when the pin fades in under the pointer. */}
      {node.isFile ? (
        <span className="w-6 shrink-0" aria-hidden />
      ) : (
        <button
          type="button"
          onClick={() => onTogglePin(node.path)}
          aria-pressed={isPinned}
          aria-label={`${isPinned ? "Unpin" : "Pin"} ${node.name}`}
          className={`w-6 shrink-0 rounded p-1 transition-opacity ${
            isPinned
              ? "text-accent-500 opacity-100"
              : "text-ink-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 dark:text-ink-500"
          }`}
        >
          <IconPin className="h-3 w-3" />
        </button>
      )}

      <span className="w-7 shrink-0 text-right font-mono text-[11px] text-ink-400 tabular-nums dark:text-ink-500">
        {node.isFile ? "" : node.fileCount}
      </span>
    </div>
  );
}

