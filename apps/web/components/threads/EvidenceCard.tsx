"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import type { Evidence } from "@blueprint/shared-types";
import { IconArrowRight, IconFile, IconSymbol } from "@/components/workspace/icons";

const KIND_LABEL: Record<Evidence["chunk_type"], string> = {
  code: "Source",
  doc: "Documentation",
  symbol: "Symbol",
  file: "File",
};

/** One resolved citation — a real slice of the studied repository, made a
 * handle: the [n] badge matches the marker in the prose, the location is
 * the actual file/symbol/lines, and (when the study captured source) the
 * excerpt expands in place. "Open in Atlas" links the map, keeping Threads
 * and Atlas connected (PRODUCT-spec). Never fabricated — a card exists only
 * because retrieval genuinely surfaced it. */
export function EvidenceCard({
  evidence,
  repositoryId,
  highlighted,
  domId,
}: {
  evidence: Evidence;
  repositoryId: string;
  highlighted?: boolean;
  /** DOM id used by the [n] citation to scroll here — scoped per answer so
   * a citation jumps to *its* card, not a same-numbered one elsewhere. */
  domId?: string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = evidence.chunk_type === "file" || evidence.chunk_type === "doc" ? IconFile : IconSymbol;
  const location = evidence.symbol_name ?? evidence.file_path ?? "Unlocated";
  const sub =
    evidence.symbol_name && evidence.file_path ? evidence.file_path : null;
  const lines =
    evidence.start_line && evidence.end_line
      ? `Lines ${evidence.start_line}–${evidence.end_line}`
      : null;

  return (
    <motion.div
      id={domId ?? `evidence-${evidence.index}`}
      layout
      className={`glass edge-light rounded-xl p-3 transition-shadow duration-500 ${
        highlighted ? "ring-2 ring-accent-400/60" : "ring-0"
      }`}
    >
      <button
        type="button"
        onClick={() => evidence.excerpt && setOpen((o) => !o)}
        className="flex w-full items-start gap-2.5 text-left"
        aria-expanded={evidence.excerpt ? open : undefined}
      >
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-accent-500/12 text-[0.68rem] font-semibold text-accent-700 tabular-nums dark:text-accent-300">
          {evidence.index}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Icon className="size-3.5 shrink-0 text-ink-400" />
            <span className="truncate font-mono text-[0.82rem] font-medium text-ink-900 dark:text-ink-50">
              {location}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.72rem] text-ink-500 dark:text-ink-400">
            <span className="uppercase tracking-wide">{KIND_LABEL[evidence.chunk_type]}</span>
            {evidence.symbol_type ? <span>· {evidence.symbol_type}</span> : null}
            {lines ? <span>· {lines}</span> : null}
          </span>
          {sub ? (
            <span className="mt-0.5 block truncate font-mono text-[0.72rem] text-ink-400">{sub}</span>
          ) : null}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && evidence.excerpt ? (
          <motion.pre
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="mt-2.5 overflow-x-auto rounded-lg bg-ink-950/[0.04] p-2.5 font-mono text-[0.72rem] leading-relaxed text-ink-700 dark:bg-white/[0.05] dark:text-ink-200"
          >
            <code>{evidence.excerpt}</code>
          </motion.pre>
        ) : null}
      </AnimatePresence>

      {evidence.file_path ? (
        <Link
          href={`/repo/${repositoryId}`}
          className="mt-2 inline-flex items-center gap-1 text-[0.72rem] font-medium text-ink-500 transition hover:text-accent-600 dark:hover:text-accent-400"
        >
          Open in Atlas
          <IconArrowRight className="size-3" />
        </Link>
      ) : null}
    </motion.div>
  );
}
