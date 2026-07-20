"use client";

import { useEffect, useMemo, useState } from "react";
import { IconSearch } from "@/components/workspace/icons";

export interface DocsSection {
  id: string;
  title: string;
}

/** The Docs page's left nav — search-filtered, scrollspy-highlighted.
 * Filtering is a plain substring match over section titles; there are a
 * handful of sections today, not enough to justify a fuzzy-search
 * dependency. */
export function DocsSidebar({ sections }: { sections: DocsSection[] }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter((section) => section.title.toLowerCase().includes(q));
  }, [sections, query]);

  return (
    <nav aria-label="Documentation sections" className="sticky top-32 hidden w-56 shrink-0 flex-col gap-4 lg:flex">
      <div className="relative">
        <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-400 dark:text-ink-500" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search docs…"
          aria-label="Search documentation"
          className="w-full rounded-full border border-ink-950/10 bg-white/70 py-2 pr-3 pl-8 text-sm text-ink-950 outline-none placeholder:text-ink-400 focus-visible:border-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:border-white/10 dark:bg-ink-900/70 dark:text-ink-50 dark:placeholder:text-ink-500"
        />
      </div>
      <ul className="flex flex-col gap-0.5">
        {filtered.length === 0 ? (
          <li className="px-3 py-1.5 text-sm text-ink-400 dark:text-ink-500">No matches.</li>
        ) : (
          filtered.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={active === section.id ? "location" : undefined}
                className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active === section.id
                    ? "bg-ink-950/5 font-medium text-ink-950 dark:bg-white/8 dark:text-ink-50"
                    : "text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200"
                }`}
              >
                {section.title}
              </a>
            </li>
          ))
        )}
      </ul>
    </nav>
  );
}
