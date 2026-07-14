"use client";

import { Surface, Tilt } from "@blueprint/ui";
import { ScrollReveal, ScrollStagger } from "./ScrollReveal";
import { IconSearch } from "@/components/workspace/icons";
import { ConfidenceMark } from "@/components/study/Confidence";

/** A tiny, honest Briefing excerpt — three lines of prose and the
 * confidence marks that back them, the same grammar the real room
 * uses, just smaller. */
function BriefingPreview() {
  return (
    <div className="flex h-36 flex-col justify-between rounded-xl bg-ink-950/[0.025] p-4 dark:bg-white/[0.03]">
      <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">
        <span className="font-medium text-ink-900 dark:text-ink-50">graph-engine</span> is the
        load-bearing module — every other package traces back to it within two hops.
      </p>
      <div className="flex items-center gap-4">
        <ConfidenceMark confidence="measured" />
        <ConfidenceMark confidence="likely" />
      </div>
    </div>
  );
}

/** A tiny orbital graph — the same "ring = distance from keystone" idea
 * as the real Atlas, reduced to five nodes and no interaction. */
function AtlasPreview() {
  const nodes = [
    { x: 50, y: 50, r: 4.2, keystone: true },
    { x: 22, y: 32, r: 2.4 },
    { x: 78, y: 30, r: 2.4 },
    { x: 20, y: 74, r: 2.4 },
    { x: 80, y: 76, r: 2.4 },
  ];
  return (
    <div className="h-36 overflow-hidden rounded-xl bg-ink-950/[0.025] dark:bg-white/[0.03]">
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
        {nodes.slice(1).map((n, i) => (
          <line
            key={i}
            x1={50}
            y1={50}
            x2={n.x}
            y2={n.y}
            stroke="currentColor"
            strokeWidth="0.6"
            className="text-ink-950/15 dark:text-white/15"
          />
        ))}
        {nodes.map((n, i) => (
          <circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={n.keystone ? "var(--color-accent-500)" : "currentColor"}
            className={n.keystone ? "" : "text-ink-950/40 dark:text-white/40"}
          />
        ))}
      </svg>
    </div>
  );
}

/** A tiny exchange — question, answer, the same asymmetric bubble
 * grammar the real Threads panel will use. */
function ThreadsPreview() {
  return (
    <div className="flex h-36 flex-col justify-end gap-2 rounded-xl bg-ink-950/[0.025] p-4 dark:bg-white/[0.03]">
      <div className="ml-auto max-w-[75%] rounded-2xl rounded-br-sm bg-ink-950 px-3 py-2 text-xs text-white dark:bg-white dark:text-ink-950">
        Where does retry logic live?
      </div>
      <div className="glass edge-light mr-auto max-w-[85%] rounded-2xl rounded-bl-sm px-3 py-2 text-xs text-ink-700 dark:text-ink-300">
        In <span className="font-mono text-accent-600 dark:text-accent-400">ingest/retry.ts</span>,
        wrapping every sync job.
      </div>
    </div>
  );
}

/** A tiny palette — search icon, an input row, two ranked results. */
function SearchPreview() {
  return (
    <div className="flex h-36 flex-col gap-2.5 rounded-xl bg-ink-950/[0.025] p-4 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2 rounded-full border border-ink-950/8 bg-white/60 px-3 py-1.5 dark:border-white/10 dark:bg-ink-900/60">
        <IconSearch className="size-3.5 text-ink-400" />
        <span className="text-xs text-ink-400 dark:text-ink-500">auth middleware</span>
      </div>
      <div className="flex flex-col gap-1.5 px-1">
        {["apps/api/auth/session.py", "apps/web/lib/auth-client.ts"].map((path) => (
          <div key={path} className="flex items-center justify-between text-xs">
            <span className="font-mono text-ink-700 dark:text-ink-300">{path}</span>
            <span className="text-ink-400 dark:text-ink-500">module</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  {
    title: "AI Briefings",
    description:
      "A thesis, not a dashboard — the architect's read of your codebase, with every claim traceable to source.",
    Preview: BriefingPreview,
  },
  {
    title: "Architecture Atlas",
    description:
      "The real shape of the system: modules positioned by dependency distance from the keystone, not by guesswork.",
    Preview: AtlasPreview,
  },
  {
    title: "Threads",
    description: "Ask what you're trying to find out. Answers cite the exact files and functions behind them.",
    Preview: ThreadsPreview,
  },
  {
    title: "Semantic Search",
    description: "Search by meaning, not string match — find the module that handles a concept, not just its name.",
    Preview: SearchPreview,
  },
] as const;

export function FeatureShowcase() {
  return (
    <section id="features" className="relative z-10 scroll-mt-28 px-6 py-24 lg:px-12 lg:py-32">
      <div className="mx-auto max-w-5xl">
        <ScrollReveal className="max-w-2xl">
          <h2
            className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl xl:text-5xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            Built for modern codebases.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            Blueprint doesn&apos;t summarize your repository. It studies it, then hands you the
            model of what it found — walkable, interrogable, always traceable back to code.
          </p>
        </ScrollReveal>

        <ScrollStagger
          className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2"
          itemClassName=""
          stagger={0.08}
        >
          {FEATURES.map(({ title, description, Preview }) => (
            <Tilt key={title} maxTilt={2.5} glare={false}>
              <Surface padding="lg" className="flex h-full flex-col gap-5">
                <Preview />
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-lg font-semibold text-ink-950 dark:text-ink-50">{title}</h3>
                  <p className="text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                    {description}
                  </p>
                </div>
              </Surface>
            </Tilt>
          ))}
        </ScrollStagger>
      </div>
    </section>
  );
}
