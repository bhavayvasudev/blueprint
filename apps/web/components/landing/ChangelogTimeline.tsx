"use client";

import { useMemo, useState } from "react";

export type ChangelogTag = "feature" | "fix" | "improvement" | "milestone";

export interface ChangelogEntry {
  id: string;
  date: string;
  version?: string;
  tag: ChangelogTag;
  title: string;
  description: string;
}

const FILTERS: { id: ChangelogTag | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "feature", label: "Features" },
  { id: "fix", label: "Fixes" },
  { id: "improvement", label: "Improvements" },
];

const TAG_LABEL: Record<ChangelogTag, string> = {
  feature: "Feature",
  fix: "Fix",
  improvement: "Improvement",
  milestone: "Milestone",
};

const TAG_BADGE: Record<ChangelogTag, string> = {
  feature: "bg-accent-500/10 text-accent-600 dark:bg-accent-400/15 dark:text-accent-400",
  fix: "bg-status-failed/10 text-status-failed-deep dark:bg-status-failed/15 dark:text-status-failed",
  improvement: "bg-status-ready/10 text-status-ready-deep dark:bg-status-ready/15 dark:text-status-ready",
  milestone: "bg-ink-950/8 text-ink-600 dark:bg-white/10 dark:text-ink-300",
};

const TAG_DOT: Record<ChangelogTag, string> = {
  feature: "border-accent-500 bg-accent-500",
  fix: "border-status-failed bg-status-failed",
  improvement: "border-status-ready bg-status-ready",
  milestone: "border-ink-400 bg-ink-400 dark:border-ink-500 dark:bg-ink-500",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** The dated release rail plus its type filter. Renders honestly empty
 * when `entries` is empty — no fabricated version history — but keeps
 * the filter and badge vocabulary visible so the page reads as "ready to
 * receive releases," not broken. */
export function ChangelogTimeline({ entries }: { entries: ChangelogEntry[] }) {
  const [filter, setFilter] = useState<ChangelogTag | "all">("all");
  const filtered = useMemo(
    () => (filter === "all" ? entries : entries.filter((entry) => entry.tag === filter)),
    [entries, filter],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by type">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === item.id
                ? "bg-ink-950 text-white dark:bg-white dark:text-ink-950"
                : "glass edge-light text-ink-600 hover:text-ink-950 dark:text-ink-300 dark:hover:text-ink-50"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="relative mt-10 flex flex-col gap-9 border-l border-ink-950/10 pl-8 dark:border-white/10">
        {filtered.length === 0 ? (
          <div className="relative">
            <span className="absolute top-1.5 -left-[calc(2rem+5px)] size-2.5 rounded-full border-2 border-ink-300 bg-[var(--background)] dark:border-ink-700" />
            <p className="text-sm text-ink-500 dark:text-ink-400">
              {entries.length === 0
                ? "Nothing published yet — your first release will appear here."
                : "No entries match this filter yet."}
            </p>
          </div>
        ) : (
          filtered.map((entry) => (
            <div key={entry.id} className="relative">
              <span
                className={`absolute top-1.5 -left-[calc(2rem+5px)] size-2.5 rounded-full border-2 ${TAG_DOT[entry.tag]}`}
              />
              <span className="text-xs text-ink-400 dark:text-ink-500">
                {formatDate(entry.date)}
                {entry.version ? ` · v${entry.version}` : ""}
              </span>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TAG_BADGE[entry.tag]}`}>
                  {TAG_LABEL[entry.tag]}
                </span>
                <h3 className="text-sm font-semibold text-ink-950 dark:text-ink-50">{entry.title}</h3>
              </div>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                {entry.description}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
