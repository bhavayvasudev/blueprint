"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ScrollReveal } from "./ScrollReveal";
import {
  IconArchitecture,
  IconClock,
  IconGitHub,
  IconGraph,
  IconOverview,
} from "@/components/workspace/icons";

const STEPS = [
  {
    n: "01",
    title: "Repository",
    description: "Connect over the GitHub App — read-only, no PATs, nothing leaves the documented posture.",
    icon: IconGitHub,
  },
  {
    n: "02",
    title: "Indexing",
    description: "Every file is parsed and every import resolved, with a confidence score per file.",
    icon: IconClock,
  },
  {
    n: "03",
    title: "Knowledge Graph",
    description: "Files and imports become a graph of modules, dependencies, and cycles.",
    icon: IconGraph,
  },
  {
    n: "04",
    title: "AI Understanding",
    description: "The graph is read into a thesis — a keystone, its cycles, its blast radius.",
    icon: IconArchitecture,
  },
  {
    n: "05",
    title: "Developer Workspace",
    description: "The Briefing, the Atlas, Threads, and Insights — the same study, four ways in.",
    icon: IconOverview,
  },
] as const;

export function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 75%", "end 55%"],
  });
  const lineScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="how-it-works" className="relative z-10 scroll-mt-28 px-6 py-24 lg:px-12 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal className="mx-auto max-w-xl text-center">
          <h2
            className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl xl:text-5xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            How Blueprint works.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            Five stages between a repository and an architect who has already read it.
          </p>
        </ScrollReveal>

        <div ref={containerRef} className="relative mt-16">
          {/* Connector — vertical on small screens, horizontal from md up. */}
          <div className="absolute top-6 bottom-6 left-6 w-px bg-ink-950/8 md:top-6 md:right-6 md:bottom-auto md:left-6 md:h-px md:w-auto dark:bg-white/10" />
          <motion.div
            aria-hidden
            style={reduceMotion ? undefined : { scaleY: lineScale, scaleX: lineScale }}
            className="absolute top-6 bottom-6 left-6 w-px origin-top bg-accent-500 md:top-6 md:right-6 md:bottom-auto md:left-6 md:h-px md:w-auto md:origin-left"
          />

          <ol className="relative flex flex-col gap-10 md:flex-row md:justify-between md:gap-6">
            {STEPS.map((step, index) => (
              <ScrollReveal key={step.n} delay={index * 0.06} distance={20} className="relative flex gap-4 md:flex-1 md:flex-col md:gap-5">
                <span className="glass edge-light relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full text-accent-600 dark:text-accent-400">
                  <step.icon className="size-5" />
                </span>
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-xs font-medium tracking-wide text-ink-400 dark:text-ink-500">
                    {step.n}
                  </span>
                  <h3 className="text-base font-semibold text-ink-950 dark:text-ink-50">{step.title}</h3>
                  <p className="max-w-[22ch] text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                    {step.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
