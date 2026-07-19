"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { Thread } from "@blueprint/shared-types";
import { timeAgo } from "@/lib/format";
import { IconPin, IconPlus, IconSearch, IconTrash } from "@/components/workspace/icons";
import { ThreadStatusBadge } from "./ThreadStatusBadge";

/** The left pane — recent investigations, pinned to the top, searchable.
 * Apple-Notes register: quiet rows, the active one lifted, actions on
 * hover. This is content *inside* the Threads room, not workspace chrome —
 * room-to-room navigation stays in the dock (PRODUCT.md §"two pieces of
 * chrome"). */
export function ThreadListPanel({
  threads,
  activeId,
  onSelect,
  onNew,
  onTogglePin,
  onDelete,
}: {
  threads: Thread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onTogglePin: (thread: Thread) => void;
  onDelete: (thread: Thread) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? threads.filter((t) => t.title.toLowerCase().includes(q)) : threads;
  }, [threads, query]);

  const pinned = filtered.filter((t) => t.pinned);
  const recent = filtered.filter((t) => !t.pinned);

  return (
    <div className="glass-strong edge-light flex h-full flex-col rounded-2xl">
      <div className="flex flex-col gap-3 p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex items-center justify-center gap-2 rounded-xl bg-ink-950 py-2.5 text-[0.85rem] font-medium text-white transition hover:bg-ink-800 dark:bg-white dark:text-ink-950 dark:hover:bg-ink-100"
        >
          <IconPlus className="size-4" />
          New Thread
        </button>
        <div className="flex items-center gap-2 rounded-xl bg-ink-950/[0.04] px-3 dark:bg-white/[0.05]">
          <IconSearch className="size-3.5 shrink-0 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search investigations"
            className="w-full bg-transparent py-2 text-[0.83rem] text-ink-800 placeholder:text-ink-400 focus:outline-none dark:text-ink-100"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-[0.8rem] text-ink-400">
            {query ? "No matching investigations." : "No investigations yet."}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {pinned.length > 0 ? (
              <ThreadSection
                label="Pinned"
                threads={pinned}
                activeId={activeId}
                onSelect={onSelect}
                onTogglePin={onTogglePin}
                onDelete={onDelete}
              />
            ) : null}
            {recent.length > 0 ? (
              <ThreadSection
                label={pinned.length > 0 ? "Recent" : undefined}
                threads={recent}
                activeId={activeId}
                onSelect={onSelect}
                onTogglePin={onTogglePin}
                onDelete={onDelete}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadSection({
  label,
  threads,
  activeId,
  onSelect,
  onTogglePin,
  onDelete,
}: {
  label?: string;
  threads: Thread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onTogglePin: (thread: Thread) => void;
  onDelete: (thread: Thread) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <span className="px-2 pb-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
          {label}
        </span>
      ) : null}
      <AnimatePresence initial={false}>
        {threads.map((thread) => {
          const active = thread.id === activeId;
          return (
            <motion.div
              key={thread.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="group relative"
            >
              <button
                type="button"
                onClick={() => onSelect(thread.id)}
                className={`flex w-full flex-col gap-1 rounded-xl px-2.5 py-2 text-left transition ${
                  active
                    ? "glass edge-light"
                    : "hover:bg-ink-950/[0.04] dark:hover:bg-white/[0.05]"
                }`}
              >
                <span className="line-clamp-1 pr-12 text-[0.86rem] font-medium text-ink-900 dark:text-ink-50">
                  {thread.title}
                </span>
                <span className="flex items-center gap-2">
                  <ThreadStatusBadge status={thread.status} />
                  <span className="text-[0.7rem] text-ink-400">{timeAgo(thread.updated_at)}</span>
                </span>
              </button>
              <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onTogglePin(thread)}
                  aria-label={thread.pinned ? "Unpin" : "Pin"}
                  className={`flex size-6 items-center justify-center rounded-lg transition hover:bg-ink-950/[0.06] dark:hover:bg-white/10 ${
                    thread.pinned ? "text-accent-500" : "text-ink-400"
                  }`}
                >
                  <IconPin className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(thread)}
                  aria-label="Delete investigation"
                  className="flex size-6 items-center justify-center rounded-lg text-ink-400 transition hover:bg-rose-500/10 hover:text-rose-500"
                >
                  <IconTrash className="size-3.5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
