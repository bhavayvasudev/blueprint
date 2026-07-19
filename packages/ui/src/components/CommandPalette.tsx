"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Kbd } from "./Kbd";
import { Scrim, useOverlay } from "./overlay";

export interface Command {
  id: string;
  label: string;
  /** Right-aligned context — a room name, a module path. */
  hint?: string;
  /** Secondary context sitting directly after the label — the file a symbol
   * lives in, the source of a doc section. Truncates before the label does,
   * since the label is the thing being identified. */
  detail?: string;
  icon?: ReactNode;
  /** Extra match terms beyond the label. */
  keywords?: string;
  /** Shortcut hint, rendered as Kbd chips (display only). */
  kbd?: string[];
  onSelect: () => void;
}

export interface CommandGroup {
  label: string;
  commands: Command[];
  /** Set for groups whose commands were already matched against the query
   * elsewhere — server-side search results, typically. The palette shows
   * them verbatim instead of filtering them a second time against a query
   * they were built from (which would drop, say, a `main.py` hit for the
   * query "entrypoint"). */
  prefiltered?: boolean;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  groups: CommandGroup[];
  placeholder?: string;
  /** Controlled query. Provide both to drive remote search from the caller;
   * omit both and the palette owns its own query as before. */
  query?: string;
  onQueryChange?: (query: string) => void;
  /** A search is in flight. Renders as a hairline progress line under the
   * input rather than replacing results — results stay on screen and update
   * in place, so typing never flashes the panel empty. */
  loading?: boolean;
  /** Replaces the default "nothing matches" copy — the place to explain
   * *why* there's nothing (never indexed, no threads yet) instead of
   * shrugging. */
  emptyState?: ReactNode;
}

/** The ⌘K layer — asking is the universal entry (UX strategy §7: the
 * primary nav is a verb, not a menu). Raycast anatomy: one input, grouped
 * results, right-aligned shortcut hints, no chrome. Lives on the modal
 * stratum (z-50) in glass-strong (MASTER.md §4/§5); full keyboard
 * operation (§12): arrows move, Enter runs, Escape leaves, focus is
 * trapped and returned. The caller owns the ⌘K binding and what the
 * commands do. */
export function CommandPalette({
  open,
  onClose,
  groups,
  placeholder = "Ask, or jump anywhere…",
  query: controlledQuery,
  onQueryChange,
  loading = false,
  emptyState,
}: CommandPaletteProps) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [uncontrolledQuery, setUncontrolledQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const isControlled = controlledQuery !== undefined;
  const query = isControlled ? controlledQuery : uncontrolledQuery;

  const setQuery = (next: string) => {
    if (!isControlled) setUncontrolledQuery(next);
    onQueryChange?.(next);
  };

  useOverlay(open, onClose, panelRef);

  // A fresh opening is a fresh question.
  useEffect(() => {
    if (open) {
      setUncontrolledQuery("");
      onQueryChange?.("");
      setActiveIndex(0);
    }
    // `onQueryChange` is intentionally omitted: this must run on open, not
    // whenever the caller happens to hand over a new callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .map((group) => {
        if (group.prefiltered || !needle) return group;
        return {
          ...group,
          commands: group.commands.filter((command) =>
            `${command.label} ${command.keywords ?? ""}`.toLowerCase().includes(needle),
          ),
        };
      })
      .filter((group) => group.commands.length > 0);
  }, [groups, query]);

  const flat = useMemo(() => filtered.flatMap((group) => group.commands), [filtered]);
  const active = flat[Math.min(activeIndex, flat.length - 1)];

  useEffect(() => {
    if (!active) return;
    document
      .getElementById(`${baseId}-opt-${active.id}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, baseId]);

  function run(command: Command) {
    onClose();
    command.onSelect();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (flat.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + flat.length) % flat.length);
    } else if (event.key === "Enter" && active) {
      event.preventDefault();
      run(active);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-24 md:pt-32">
          <Scrim onClose={onClose} />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0 } }
                : { opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.18, ease: "easeIn" } }
            }
            transition={{ type: "spring", stiffness: 340, damping: 30, mass: 0.7 }}
            className="glass-strong edge-light relative w-full max-w-xl overflow-hidden rounded-2xl outline-none"
          >
            <div className="relative flex items-center gap-3 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
              <svg viewBox="0 0 16 16" className="size-4 text-ink-400" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={active ? `${baseId}-opt-${active.id}` : undefined}
                aria-label="Search commands"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                placeholder={placeholder}
                className="w-full bg-transparent text-sm text-ink-950 outline-none placeholder:text-ink-400 dark:text-ink-50 dark:placeholder:text-ink-500"
              />
              <Kbd>esc</Kbd>

              {/* Search-in-flight, as a hairline sweep along the input's
                  lower edge. Deliberately not a spinner and deliberately not
                  a state that replaces the list: results stay put and update
                  in place, so fast typing never flashes the panel empty. */}
              <AnimatePresence>
                {loading && (
                  <motion.span
                    aria-hidden
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden"
                  >
                    <motion.span
                      className="absolute inset-y-0 w-1/3 bg-accent-500/70"
                      animate={reduceMotion ? { opacity: 0.5 } : { x: ["-100%", "300%"] }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { duration: 1.1, repeat: Infinity, ease: "easeInOut" }
                      }
                    />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <div id={listId} role="listbox" className="max-h-80 overflow-y-auto p-2">
              {flat.length === 0 &&
                (emptyState ?? (
                  <p className="px-3 py-8 text-center text-sm text-ink-500 dark:text-ink-400">
                    Nothing matches “{query}”. The architect can’t take you there yet.
                  </p>
                ))}
              {filtered.map((group) => (
                <div key={group.label} role="group" aria-label={group.label}>
                  <p className="px-3 pt-3 pb-1.5 text-xs font-medium text-ink-500 dark:text-ink-400">
                    {group.label}
                  </p>
                  {group.commands.map((command) => {
                    const isActive = command === active;
                    return (
                      <div
                        key={command.id}
                        id={`${baseId}-opt-${command.id}`}
                        role="option"
                        aria-selected={isActive}
                        onPointerMove={() => setActiveIndex(flat.indexOf(command))}
                        onClick={() => run(command)}
                        className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                          isActive
                            ? "bg-accent-50 text-ink-950 dark:bg-accent-700/20 dark:text-ink-50"
                            : "text-ink-700 dark:text-ink-300"
                        }`}
                      >
                        {command.icon && (
                          <span className="text-ink-500 dark:text-ink-400" aria-hidden="true">
                            {command.icon}
                          </span>
                        )}
                        <span className="flex min-w-0 flex-1 items-baseline gap-2">
                          <span className="shrink-0">{command.label}</span>
                          {command.detail && (
                            <span className="truncate font-mono text-xs text-ink-400 dark:text-ink-500">
                              {command.detail}
                            </span>
                          )}
                        </span>
                        {command.hint && (
                          <span className="shrink-0 text-xs text-ink-400 dark:text-ink-500">
                            {command.hint}
                          </span>
                        )}
                        {command.kbd && (
                          <span className="flex gap-1">
                            {command.kbd.map((key) => (
                              <Kbd key={key}>{key}</Kbd>
                            ))}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 border-t border-ink-100 px-5 py-3 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> navigate
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>⏎</Kbd> go
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
