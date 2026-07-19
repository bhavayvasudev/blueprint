"use client";

import { useCallback, useSyncExternalStore } from "react";

/** The Atlas explorer's memory — which folders are open, and which are
 * pinned to the top. Persisted per repository so returning to a repo
 * returns you to the shape you left it in, not a collapsed root.
 *
 * Same subscription contract as `useStatsForNerds`: a read *over*
 * `localStorage` rather than a copy of it, with a custom event standing
 * in for the `storage` event (which only fires in other tabs). The
 * parsed snapshot is memoized against the raw string because
 * `useSyncExternalStore` demands a stable reference — parsing on every
 * call would loop forever. */

const STORAGE_PREFIX = "blueprint-explorer:";
const CHANGE_EVENT = "blueprint-explorer-change";

export interface ExplorerState {
  expanded: string[];
  pinned: string[];
}

const EMPTY: ExplorerState = { expanded: [], pinned: [] };

let cacheKey: string | null = null;
let cacheRaw: string | null = null;
let cacheValue: ExplorerState = EMPTY;

function readState(repositoryId: string): ExplorerState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_PREFIX + repositoryId);
  } catch {
    return EMPTY;
  }
  if (raw === null) return EMPTY;
  if (cacheKey === repositoryId && cacheRaw === raw) return cacheValue;

  let parsed: ExplorerState = EMPTY;
  try {
    const candidate = JSON.parse(raw) as Partial<ExplorerState>;
    parsed = {
      expanded: Array.isArray(candidate.expanded) ? candidate.expanded.filter(isString) : [],
      pinned: Array.isArray(candidate.pinned) ? candidate.pinned.filter(isString) : [],
    };
  } catch {
    // A malformed entry reads as no memory at all rather than crashing
    // the room it decorates.
    parsed = EMPTY;
  }
  cacheKey = repositoryId;
  cacheRaw = raw;
  cacheValue = parsed;
  return parsed;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export interface ExplorerControls {
  isExpanded: (path: string) => boolean;
  toggleExpanded: (path: string) => void;
  isPinned: (path: string) => boolean;
  togglePinned: (path: string) => void;
  pinned: string[];
  /** True once the browser's stored state has been read — before this,
   * the tree renders from `defaultExpanded` on both server and client so
   * hydration matches, then settles into remembered state. */
  hydrated: boolean;
}

export function useExplorerState(
  repositoryId: string,
  defaultExpanded: string[],
): ExplorerControls {
  const state = useSyncExternalStore(
    subscribe,
    () => readState(repositoryId),
    () => EMPTY,
  );
  // On the server (and the first client paint) there is no stored state,
  // so the caller's defaults stand in. `hydrated` distinguishes "nothing
  // remembered yet" from "remembered as all-collapsed".
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const write = useCallback(
    (next: ExplorerState) => {
      try {
        localStorage.setItem(STORAGE_PREFIX + repositoryId, JSON.stringify(next));
      } catch {
        // Private browsing — the toggle still works for this session via
        // the event below, it just won't survive a reload.
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [repositoryId],
  );

  const effectiveExpanded = hydrated && hasMemory(state) ? state.expanded : defaultExpanded;

  const isExpanded = useCallback(
    (path: string) => effectiveExpanded.includes(path),
    [effectiveExpanded],
  );

  const toggleExpanded = useCallback(
    (path: string) => {
      const set = new Set(effectiveExpanded);
      if (!set.delete(path)) set.add(path);
      write({ expanded: [...set], pinned: state.pinned });
    },
    [effectiveExpanded, state.pinned, write],
  );

  const isPinned = useCallback((path: string) => state.pinned.includes(path), [state.pinned]);

  const togglePinned = useCallback(
    (path: string) => {
      const set = new Set(state.pinned);
      if (!set.delete(path)) set.add(path);
      write({ expanded: effectiveExpanded, pinned: [...set] });
    },
    [effectiveExpanded, state.pinned, write],
  );

  return {
    isExpanded,
    toggleExpanded,
    isPinned,
    togglePinned,
    pinned: hydrated ? state.pinned : [],
    hydrated,
  };
}

/** An explicitly-emptied tree is still a memory — only the total absence
 * of a stored entry falls back to the caller's defaults. */
function hasMemory(state: ExplorerState): boolean {
  return state !== EMPTY;
}
