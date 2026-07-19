"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "blueprint-stats-for-nerds";
const CHANGE_EVENT = "blueprint-stats-for-nerds-change";

/** "Stats for nerds" — the raw technical inventory (file-by-module
 * breakdowns, method rows, the architecture graph's internals) that the
 * redesigned Atlas no longer leads with. Off by default, remembered
 * per-browser once turned on: the Atlas's first screen answers "what is
 * this, what works, what's missing, how healthy is it" — this is the
 * escape hatch back to the underlying counts for anyone who wants them,
 * not a second copy of the same information shown twice.
 *
 * A subscription over `localStorage`, not a copy of it (same contract
 * as `ThemeProvider`'s `.dark`-class subscription) — a custom event
 * stands in for `localStorage`'s own `storage` event, which only fires
 * in *other* tabs, never the one that made the write. */
function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useStatsForNerds(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => false);

  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Private browsing — the toggle still works for the session via the event below.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [enabled, set];
}
