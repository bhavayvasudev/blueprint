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
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  groups: CommandGroup[];
  placeholder?: string;
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
}: CommandPaletteProps) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useOverlay(open, onClose, panelRef);

  // A fresh opening is a fresh question.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        commands: group.commands.filter((command) =>
          `${command.label} ${command.keywords ?? ""}`.toLowerCase().includes(needle),
        ),
      }))
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
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0 } }
                : { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.22, ease: "easeIn" } }
            }
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="glass-strong edge-light relative w-full max-w-xl overflow-hidden rounded-2xl outline-none"
          >
            <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
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
            </div>

            <div id={listId} role="listbox" className="max-h-80 overflow-y-auto p-2">
              {flat.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-ink-500 dark:text-ink-400">
                  Nothing matches “{query}”. The architect can’t take you there yet.
                </p>
              )}
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
                        <span className="flex-1">{command.label}</span>
                        {command.hint && (
                          <span className="text-xs text-ink-400 dark:text-ink-500">
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
