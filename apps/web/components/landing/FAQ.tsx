"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { Surface } from "@blueprint/ui";
import { ScrollReveal } from "./ScrollReveal";
import { IconChevronDown } from "@/components/workspace/icons";

const QUESTIONS = [
  {
    q: "How does Blueprint access my code?",
    a: "Through a GitHub App installation, never a personal access token. Access is read-only and scoped to the repositories you explicitly connect — you can revoke it from GitHub at any time.",
  },
  {
    q: "Which languages does it understand?",
    a: "Blueprint parses with tree-sitter, so support is per-grammar rather than all-or-nothing. TypeScript, JavaScript, Python, and Go have full import resolution today; other languages are counted and included in the file tree but with lower parse confidence, which the workspace always states plainly.",
  },
  {
    q: "Is my code used to train anything?",
    a: "No. Analysis runs per-repository and stays scoped to your workspace. Nothing you connect is used to train a shared model.",
  },
  {
    q: "How is confidence calculated?",
    a: "Every claim is one of three states — measured, likely, or undetermined — based on how directly it traces to parsed source. A claim resting on a file Blueprint couldn't fully parse is downgraded automatically; it's never rounded up.",
  },
  {
    q: "What happens if I disconnect a repository?",
    a: "Its indexed graph and generated Briefing are deleted from Blueprint's storage. Nothing was ever written back to the repository itself.",
  },
  {
    q: "Can I try it before paying?",
    a: "Yes — Foundation is free for one repository, with the same read-only access and analysis pipeline the paid plans use, so what you see is what you'd get.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const reduceMotion = useReducedMotion();

  return (
    <section id="faq" className="relative z-10 scroll-mt-28 px-6 py-24 lg:px-12 lg:py-32">
      <div className="mx-auto max-w-3xl">
        <ScrollReveal className="text-center">
          <h2
            className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl xl:text-5xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            Questions, answered plainly.
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="mt-12">
          <Surface padding="sm" className="!p-2 divide-y divide-ink-950/6 dark:divide-white/8">
            {QUESTIONS.map((item, index) => {
              const isOpen = open === index;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-5 text-left"
                  >
                    <span className="text-base font-medium text-ink-950 dark:text-ink-50">{item.q}</span>
                    <motion.span
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className="shrink-0 text-ink-400 dark:text-ink-500"
                    >
                      <IconChevronDown className="size-4.5" />
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
                        <p className="px-4 pb-5 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                          {item.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </Surface>
        </ScrollReveal>
      </div>
    </section>
  );
}
