"use client";

import type { Contributors } from "@blueprint/shared-types";
import { Surface } from "@blueprint/ui";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { use, useState } from "react";
import { IconUsers } from "@/components/workspace/icons";

/** How many rows show before the section asks to be expanded. Enough to
 * see the shape of who carries the repository; short enough that the
 * Briefing stays a page you read rather than a list you scroll. */
const COLLAPSED_COUNT = 6;

/** Contributors — who actually wrote this repository, by commit count.
 *
 * Reads like GitHub's contributor list (avatar, handle, commits, share)
 * because that shape is genuinely the right one and inventing a different
 * one would only cost recognition. What's Blueprint's is the register: a
 * quiet row inside the Briefing's glass, share rendered as a hairline
 * proportion bar rather than a chart, no ranking medals, no gamification.
 *
 * Three distinct states, and the distinction matters:
 *
 * - `data === null` — GitHub couldn't be reached (rate limit, permission,
 *   outage). Says exactly that. It never renders as "no contributors",
 *   which would be a claim we have no basis for.
 * - `contributors: []` — GitHub answered, and nobody has committed yet.
 *   A real, reportable fact about a fresh repository.
 * - Otherwise, the list.
 *
 * There is no "last contribution" column: GitHub's contributors endpoint
 * carries no date, and the statistics endpoint that does is computed
 * asynchronously and answers 202 while it warms. A column that was
 * sometimes a date and sometimes a dash would be worse than no column,
 * and inferring one would be the fabricated number RULES.md §23 bans.
 *
 * `data` is the *promise* the page started without awaiting; this card
 * suspends behind `ContributorsSkeleton` on its own while the rest of the
 * Briefing renders (RULES.md §5 — the page still owns the fetch). */
export function ContributorsCard({ data: dataPromise }: { data: Promise<Contributors | null> }) {
  const data = use(dataPromise);
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const header = (
    <div className="flex items-center gap-2">
      <IconUsers className="size-4 text-ink-400 dark:text-ink-500" />
      <h2 className="text-sm font-semibold text-ink-950 dark:text-ink-50">Contributors</h2>
    </div>
  );

  if (!data) {
    return (
      <Surface padding="md" className="flex flex-col gap-3">
        {header}
        <p className="text-sm text-ink-500 dark:text-ink-400">
          GitHub didn&apos;t answer when I asked who contributed — the list will fill in on the next
          load. This says nothing about the repository, only about the request.
        </p>
      </Surface>
    );
  }

  if (data.contributors.length === 0) {
    return (
      <Surface padding="md" className="flex flex-col gap-3">
        {header}
        <p className="text-sm text-ink-500 dark:text-ink-400">
          No commits yet, so there&apos;s nobody to credit.
        </p>
      </Surface>
    );
  }

  const visible = expanded ? data.contributors : data.contributors.slice(0, COLLAPSED_COUNT);
  const hidden = data.contributors.length - COLLAPSED_COUNT;

  return (
    <Surface padding="md" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        {header}
        <span className="text-xs text-ink-500 dark:text-ink-400">
          {data.total_contributions.toLocaleString()} commits
          {data.truncated ? " across the top contributors" : ""}
        </span>
      </div>

      <ul className="flex flex-col">
        <AnimatePresence initial={false}>
          {visible.map((contributor, index) => (
            <motion.li
              key={contributor.login}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 34,
                // Only the rows revealed by expanding stagger; the first
                // batch is already on screen and shouldn't re-animate.
                delay: reduceMotion ? 0 : Math.max(0, index - COLLAPSED_COUNT) * 0.03,
              }}
            >
              <a
                href={contributor.html_url}
                target="_blank"
                rel="noreferrer noopener"
                className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-200 hover:bg-ink-950/[0.03] dark:hover:bg-ink-50/[0.04]"
              >
                {/* Decorative: the handle beside it is the accessible
                    name, so an empty alt avoids a screen reader reading
                    the same person twice. A contributor with no avatar
                    URL gets an initial rather than a broken image. */}
                {contributor.avatar_url ? (
                  <Image
                    src={contributor.avatar_url}
                    alt=""
                    width={32}
                    height={32}
                    className="size-8 shrink-0 rounded-full ring-1 ring-ink-950/5 transition-transform duration-200 group-hover:scale-105 dark:ring-ink-50/10"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-medium text-ink-500 ring-1 ring-ink-950/5 dark:bg-ink-800 dark:text-ink-400 dark:ring-ink-50/10"
                  >
                    {contributor.login.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                      {contributor.login}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-500 dark:text-ink-400">
                      {contributor.contributions.toLocaleString()} commits
                      <span className="ml-1.5 text-ink-400 dark:text-ink-500">
                        {formatShare(contributor.share)}
                      </span>
                    </span>
                  </div>
                  {/* The share as a hairline, drawn once. `scaleX` rather
                      than `width` keeps it off the layout thread. */}
                  <div className="h-1 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                    <motion.div
                      initial={{ scaleX: reduceMotion ? contributor.share : 0 }}
                      animate={{ scaleX: contributor.share }}
                      transition={{
                        duration: 0.7,
                        ease: [0.16, 1, 0.3, 1],
                        delay: reduceMotion ? 0 : index * 0.04,
                      }}
                      style={{ transformOrigin: "left" }}
                      className="h-full w-full rounded-full bg-accent-500"
                    />
                  </div>
                </div>
              </a>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="self-start text-xs font-medium text-accent-700 transition-colors duration-200 hover:text-accent-600 dark:text-accent-400 dark:hover:text-accent-300"
        >
          {expanded ? "Show fewer" : `Show ${hidden} more`}
        </button>
      ) : null}

      {data.truncated ? (
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Percentages are shares of these contributors&apos; commits, not the repository&apos;s full
          history — GitHub caps the list.
        </p>
      ) : null}
    </Surface>
  );
}

/** The card's shape while GitHub is still answering — avatar circles and
 * two text lines per row, at the real row height, so nothing below shifts
 * when the list resolves. */
export function ContributorsSkeleton() {
  return (
    <Surface padding="md" className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <IconUsers className="size-4 text-ink-400 dark:text-ink-500" />
        <h2 className="text-sm font-semibold text-ink-950 dark:text-ink-50">Contributors</h2>
      </div>
      <div className="flex flex-col" aria-hidden="true">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-center gap-3 py-2">
            <div className="skeleton-shimmer size-8 shrink-0 rounded-full bg-ink-100 dark:bg-ink-800" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="skeleton-shimmer h-3.5 rounded-md bg-ink-100 dark:bg-ink-800" style={{ width: `${52 - row * 8}%` }} />
              <div className="skeleton-shimmer h-1 w-full rounded-full bg-ink-100 dark:bg-ink-800" />
            </div>
          </div>
        ))}
      </div>
    </Surface>
  );
}

/** A share below half a percent rounds to "0%", which reads as "nothing"
 * for someone who did commit. `<1%` is both shorter and true. */
function formatShare(share: number): string {
  const percent = share * 100;
  if (percent > 0 && percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
}
