"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Surface } from "@blueprint/ui";
import { ScrollReveal } from "./ScrollReveal";
import {
  IconArchitecture,
  IconBriefing,
  IconClock,
  IconGitHub,
  IconGraph,
  IconSearch,
  IconThreads,
} from "@/components/workspace/icons";

const STAGES = [
  { title: "Repository connected", detail: "blueprint/atlas-core, read-only via the GitHub App", icon: IconGitHub },
  { title: "Repository indexed", detail: "1,482 files parsed, 918 imports resolved", icon: IconClock },
  { title: "Knowledge graph generated", detail: "32 modules, 8 edges into the keystone", icon: IconGraph },
  { title: "Architecture understood", detail: "graph-engine identified as the load-bearing module", icon: IconArchitecture },
  { title: "AI briefing created", detail: "A thesis written, every claim linked to evidence", icon: IconBriefing },
  { title: "Threads linked", detail: "Open questions attached to the modules they concern", icon: IconThreads },
  { title: "Semantic search ready", detail: "Every file and function searchable by meaning", icon: IconSearch },
] as const;

/** Replaces testimonials: one repository, moved end-to-end through the
 * pipeline. Nothing here is a customer quote — it's the product,
 * watched. */
export function BlueprintInAction() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 70%", "end 60%"],
  });
  const lineScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="in-action" className="relative z-10 scroll-mt-28 px-6 py-24 lg:px-12 lg:py-32">
      <div className="mx-auto max-w-2xl">
        <ScrollReveal className="text-center">
          <h2
            className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl xl:text-5xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            Blueprint, in action.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            One repository, watched end to end — this is what happens between connecting an
            account and reading the first Briefing.
          </p>
        </ScrollReveal>

        <div ref={containerRef} className="relative mt-14">
          <div className="absolute top-2 bottom-2 left-[23px] w-px bg-ink-950/8 dark:bg-white/10" />
          <motion.div
            aria-hidden
            style={reduceMotion ? undefined : { scaleY: lineScale }}
            className="absolute top-2 bottom-2 left-[23px] w-px origin-top bg-accent-500"
          />

          <ol className="relative flex flex-col gap-3">
            {STAGES.map((stage, index) => (
              <ScrollReveal key={stage.title} delay={index * 0.05} distance={16}>
                <li>
                  <Surface padding="md" className="flex items-center gap-4">
                    <span className="glass edge-light relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full text-accent-600 dark:text-accent-400">
                      <stage.icon className="size-4.5" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold text-ink-950 dark:text-ink-50">{stage.title}</span>
                      <span className="truncate text-xs text-ink-500 dark:text-ink-400">{stage.detail}</span>
                    </div>
                  </Surface>
                </li>
              </ScrollReveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
