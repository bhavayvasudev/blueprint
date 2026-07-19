"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import type { Evidence } from "@blueprint/shared-types";
import { IconWarning } from "@/components/workspace/icons";
import { AnswerBody } from "./AnswerBody";
import { EvidenceCard } from "./EvidenceCard";
import { SuggestionChips } from "./SuggestionChips";
import { ThinkingIndicator } from "./ThinkingIndicator";
import type { ThreadPhase } from "@/lib/use-thread-stream";

/** Blueprint's side of the conversation — editorial, evidence-first, no
 * speech bubble or avatar. Shared by the live (streaming) answer and every
 * persisted one, so they render identically. Evidence is a first-class
 * section, not a footnote (PRODUCT.md: interpretation above evidence, but
 * evidence always present and one click from the claim). */
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

  const onCite = (index: number) => {
    setHighlight(index);
    document
      .getElementById(`${domPrefix}-evidence-${index}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.setTimeout(() => setHighlight((h) => (h === index ? null : h)), 1600);
  };

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

      {evidence.length ? (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col gap-2.5"
        >
          <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-400">
            Repository Evidence
          </h3>
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
