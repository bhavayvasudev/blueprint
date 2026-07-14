"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useId, useState } from "react";
import type { Claim } from "@/lib/insights";
import { IconChevronDown } from "@/components/workspace/icons";
import { ConfidenceMark } from "./Confidence";
import { ProseSegments } from "./Prose";

/** One claim in the architect's read — a surveyor's memo entry, not a
 * card. Confidence sits in the left margin like marginalia; the claim
 * is prose whose module names link into the Atlas; and "why I believe
 * this" opens the reasoning-and-evidence layer inline (progressive
 * disclosure of reasoning — sequenced, never hidden behind a modal). */
export function ClaimBlock({ claim, repositoryId }: { claim: Claim; repositoryId: string }) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const drawerId = useId();

  return (
    <article className="grid gap-y-2.5 lg:grid-cols-[8.5rem_1fr] lg:gap-x-10">
      {/* Marginalia: the confidence grammar + how much evidence sits under the claim. */}
      <div className="flex items-center gap-3 lg:flex-col lg:items-end lg:gap-1 lg:pt-1.5 lg:text-right">
        <ConfidenceMark confidence={claim.confidence} />
        <span className="text-xs text-ink-400 dark:text-ink-500">
          {claim.evidence.length} {claim.evidence.length === 1 ? "source" : "sources"}
        </span>
      </div>

      <div className="min-w-0 max-w-2xl">
        <p className="text-lg leading-relaxed text-ink-900 dark:text-ink-100" style={{ textWrap: "pretty" }}>
          <ProseSegments segments={claim.statement} repositoryId={repositoryId} />
        </p>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={drawerId}
          className="group mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-accent-600 dark:text-ink-400 dark:hover:text-accent-400"
        >
          Why I believe this
          <IconChevronDown
            className={`size-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              id={drawerId}
              initial={reduceMotion ? { opacity: 1, height: "auto" } : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduceMotion ? { opacity: 0, height: "auto" } : { opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-4 border-t border-ink-950/8 pt-4 dark:border-white/8">
                <p className="max-w-xl text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  {claim.reasoning}
                </p>
                <dl className="mt-4 flex flex-col gap-2">
                  {claim.evidence.map((row) => (
                    <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
                      <dt className="w-44 shrink-0 text-xs leading-5 text-ink-500 dark:text-ink-400">
                        {row.label}
                      </dt>
                      <dd className="min-w-0 font-mono text-xs leading-5 text-ink-800 dark:text-ink-200">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                {claim.moduleIds.length > 0 ? (
                  <Link
                    href={`/repo/${repositoryId}?focus=${encodeURIComponent(claim.moduleIds[0]!)}`}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-600 transition-colors hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-200"
                  >
                    Trace it in the Atlas
                    <span aria-hidden>→</span>
                  </Link>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </article>
  );
}
