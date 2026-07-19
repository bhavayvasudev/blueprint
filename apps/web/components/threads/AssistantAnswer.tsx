"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import type { Evidence } from "@blueprint/shared-types";
import { IconChevronDown, IconWarning } from "@/components/workspace/icons";
import { AnswerBody } from "./AnswerBody";
import { EvidenceCard } from "./EvidenceCard";
import { SuggestionChips } from "./SuggestionChips";
import { ThinkingIndicator } from "./ThinkingIndicator";
import type { ThreadPhase } from "@/lib/use-thread-stream";

/** Blueprint's side of the conversation — editorial, no speech bubble or
 * avatar. Shared by the live (streaming) answer and every persisted one,
 * so they render identically.
 *
 * The hierarchy the turn reads in, top to bottom: the question (owned by
 * the timeline), the answer, Repository Evidence, then the follow-ups.
 * Evidence is always present and always one click from the claim it
 * supports (PRODUCT.md) — but it is support, so it sits folded until
 * asked for, either by this section's own disclosure or by a [n] marker
 * in the prose. Interpretation above evidence, literally. */
export function AssistantAnswer({
  domPrefix,
  content,
  evidence,
  followups,
  repositoryId,
  onFollowup,
  streaming,
  phase,
  error,
}: {
  domPrefix: string;
  content: string;
  evidence: Evidence[];
  followups: string[];
  repositoryId: string;
  onFollowup: (question: string) => void;
  streaming?: boolean;
  phase?: ThreadPhase | null;
  error?: string | null;
}) {
  const [highlight, setHighlight] = useState<number | null>(null);
  // Evidence is supporting material, so it starts folded away: the answer
  // is what the reader came for, and an unfolded wall of source cards
  // under every turn buries it. Opening it is a deliberate act — either
  // this disclosure or a [n] marker in the prose.
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const onCite = useCallback(
    (index: number) => {
      setHighlight(index);
      setEvidenceOpen(true);
      // Wait for the section to be laid out before jumping to a card
      // inside it. `block: "nearest"` keeps this to the smallest movement
      // that reveals the card — a citation is the one scroll the reader
      // actually asked for.
      requestAnimationFrame(() => {
        document
          .getElementById(`${domPrefix}-evidence-${index}`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      window.setTimeout(() => setHighlight((h) => (h === index ? null : h)), 1600);
    },
    [domPrefix],
  );

  const showThinking = streaming && !content && !error;

  return (
    <div className="flex flex-col gap-5">
      {showThinking ? <ThinkingIndicator phase={phase ?? null} /> : null}

      {content ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <AnswerBody content={content} onCite={onCite} />
        </motion.div>
      ) : null}

      {error ? (
        <div className="glass edge-light flex items-start gap-2.5 rounded-xl p-3 text-[0.88rem] text-ink-600 dark:text-ink-300">
          <IconWarning className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Supporting material, folded. It only ever grows downward — below
          the answer, out of the viewport the reader is holding — so both
          its arrival mid-stream and its expansion leave the scroll
          position exactly where it was. */}
      {evidence.length ? (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col gap-2.5"
        >
          <h3>
            <button
              type="button"
              onClick={() => setEvidenceOpen((open) => !open)}
              aria-expanded={evidenceOpen}
              className="group flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-400 transition-colors hover:text-ink-600 dark:hover:text-ink-200"
            >
              <IconChevronDown
                className={`size-3 transition-transform duration-200 ${
                  evidenceOpen ? "" : "-rotate-90"
                }`}
              />
              Repository Evidence
              <span className="font-mono text-[0.7rem] tracking-normal tabular-nums">
                {evidence.length}
              </span>
            </button>
          </h3>

          <AnimatePresence initial={false}>
            {evidenceOpen ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: { type: "spring", stiffness: 420, damping: 38, mass: 0.7 },
                  opacity: { duration: 0.16 },
                }}
                className="overflow-hidden"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  {evidence.map((item) => (
                    <EvidenceCard
                      key={`${domPrefix}-${item.index}`}
                      evidence={item}
                      repositoryId={repositoryId}
                      highlighted={highlight === item.index}
                      domId={`${domPrefix}-evidence-${item.index}`}
                    />
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.section>
      ) : null}

      {!streaming && followups.length ? (
        <section className="flex flex-col gap-2.5">
          <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
            Continue this investigation
          </h3>
          <SuggestionChips suggestions={followups} onPick={onFollowup} />
        </section>
      ) : null}
    </div>
  );
}
