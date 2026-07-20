"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { Surface } from "@blueprint/ui";
import { IconChevronDown } from "@/components/workspace/icons";

const QUESTIONS = [
  {
    q: "How fast will I hear back?",
    a: "From a real person on the team, usually within 1–2 business days. We're small and pre-launch, so replies are personal rather than templated — that's also why they're not instant.",
  },
  {
    q: "I found a security issue — is there a separate channel?",
    a: "Not a dedicated one yet. Mark the subject \"Security\" and describe what you found — we treat those first.",
  },
  {
    q: "Can I request a feature or an integration?",
    a: "Yes — that's exactly what this form is for. Concrete detail about what you're trying to do helps more than a general ask.",
  },
  {
    q: "I'm having trouble with a specific repository — what should I include?",
    a: "The repository's name and roughly when you connected it. We can't see anything you haven't told us — Blueprint doesn't share account details with support tooling automatically.",
  },
] as const;

/** Contact-specific FAQ — distinct from the homepage's product FAQ
 * (`FAQ.tsx`), which answers "what is Blueprint." This answers "what
 * happens after I submit this form." Same accordion mechanics, smaller
 * footprint since it lives inside a page section rather than owning one. */
export function ContactFAQ() {
  const [open, setOpen] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();

  return (
    <Surface padding="sm" className="!p-2 divide-y divide-ink-950/6 dark:divide-white/8">
      {QUESTIONS.map((item, index) => {
        const isOpen = open === index;
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : index)}
              aria-expanded={isOpen}
              className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-4 text-left"
            >
              <span className="text-sm font-medium text-ink-950 dark:text-ink-50">{item.q}</span>
              <motion.span
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="shrink-0 text-ink-400 dark:text-ink-500"
              >
                <IconChevronDown className="size-4" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <p className="px-4 pb-4 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </Surface>
  );
}
