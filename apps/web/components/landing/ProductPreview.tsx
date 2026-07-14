"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { ProportionBar, StatBlock, Surface } from "@blueprint/ui";
import { ScrollReveal } from "./ScrollReveal";
import { ConfidenceMark } from "@/components/study/Confidence";
import { IconArchitecture, IconBriefing, IconInsights, IconSearch, IconThreads } from "@/components/workspace/icons";

const MODULES = [
  { id: "graph-engine", x: 50, y: 46, r: 4.6, ring: 0 },
  { id: "ingest", x: 22, y: 24, r: 2.6, ring: 1 },
  { id: "briefing", x: 76, y: 22, r: 2.6, ring: 1 },
  { id: "atlas", x: 82, y: 58, r: 2.6, ring: 1 },
  { id: "insights", x: 18, y: 64, r: 2.2, ring: 2 },
  { id: "threads", x: 40, y: 84, r: 2.2, ring: 2 },
  { id: "workspace-ui", x: 66, y: 86, r: 2.2, ring: 2 },
];

function BriefingPanel() {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6 sm:p-8">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400 dark:text-ink-500">
        The Briefing · blueprint/atlas-core
      </p>
      <p className="max-w-lg text-lg leading-relaxed text-ink-800 dark:text-ink-200">
        <span className="font-semibold text-ink-950 dark:text-ink-50">graph-engine</span> is the
        load-bearing wall of this repository — every other package depends on it within two
        hops, and it depends on nothing else. Changes here carry the widest blast radius in the
        system.
      </p>
      <p className="max-w-lg text-sm leading-relaxed text-ink-600 dark:text-ink-400">
        Two packages —{" "}
        <span className="font-mono text-accent-600 dark:text-accent-400">ingest</span> and{" "}
        <span className="font-mono text-accent-600 dark:text-accent-400">briefing</span> —
        import from each other, forming the only cycle I found.
      </p>
      <div className="mt-auto flex items-center gap-5 border-t border-ink-950/6 pt-4 dark:border-white/8">
        <ConfidenceMark confidence="measured" />
        <ConfidenceMark confidence="likely" />
        <ConfidenceMark confidence="undetermined" />
      </div>
    </div>
  );
}

function AtlasPanel() {
  return (
    <div className="flex h-full flex-col gap-4 p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
      <div className="aspect-square w-full max-w-xs shrink-0 overflow-hidden rounded-xl bg-ink-950/[0.025] dark:bg-white/[0.03]">
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
          {MODULES.slice(1).map((m) => (
            <line
              key={m.id}
              x1={50}
              y1={46}
              x2={m.x}
              y2={m.y}
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-ink-950/15 dark:text-white/15"
            />
          ))}
          {MODULES.map((m) => (
            <circle
              key={m.id}
              cx={m.x}
              cy={m.y}
              r={m.r}
              fill={m.ring === 0 ? "var(--color-accent-500)" : "currentColor"}
              className={m.ring === 0 ? "" : "text-ink-950/40 dark:text-white/40"}
            />
          ))}
        </svg>
      </div>
      {/* The graph's non-visual equivalent — the same ring/keystone
          information, in a structural list. */}
      <ul className="flex flex-1 flex-col gap-2 text-sm">
        {MODULES.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-4 border-b border-ink-950/6 py-1.5 last:border-0 dark:border-white/8">
            <span className={`font-mono ${m.ring === 0 ? "font-semibold text-ink-950 dark:text-ink-50" : "text-ink-600 dark:text-ink-400"}`}>
              {m.id}
            </span>
            <span className="text-xs text-ink-400 dark:text-ink-500">
              {m.ring === 0 ? "keystone" : `ring ${m.ring}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThreadsPanel() {
  return (
    <div className="flex h-full flex-col justify-end gap-3 overflow-y-auto p-6 sm:p-8">
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-ink-950 px-4 py-2.5 text-sm text-white dark:bg-white dark:text-ink-950">
        Where is authentication handled?
      </div>
      <div className="glass edge-light mr-auto max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed text-ink-700 dark:text-ink-300">
        Session verification lives in{" "}
        <span className="font-mono text-accent-600 dark:text-accent-400">apps/api/auth/session.py</span>
        ; the web client&apos;s side is{" "}
        <span className="font-mono text-accent-600 dark:text-accent-400">apps/web/lib/auth-client.ts</span>
        . Both trace back to the GitHub App token exchange.
      </div>
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-ink-950 px-4 py-2.5 text-sm text-white dark:bg-white dark:text-ink-950">
        What calls session.py?
      </div>
    </div>
  );
}

function SearchPanel() {
  const results = [
    { path: "apps/api/auth/session.py", hint: "module · 6 refs" },
    { path: "apps/web/lib/auth-client.ts", hint: "module · 4 refs" },
    { path: "apps/api/middleware/require_user.py", hint: "function · verify_session" },
  ];
  return (
    <div className="flex h-full flex-col gap-4 p-6 sm:p-8">
      <div className="flex items-center gap-3 rounded-full border border-ink-950/8 bg-white/70 px-4 py-2.5 dark:border-white/10 dark:bg-ink-900/70">
        <IconSearch className="size-4 text-ink-400" />
        <span className="text-sm text-ink-500 dark:text-ink-400">session verification</span>
      </div>
      <div className="flex flex-col gap-1">
        {results.map((r) => (
          <div
            key={r.path}
            className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-sm hover:bg-ink-950/5 dark:hover:bg-white/8"
          >
            <span className="font-mono text-ink-800 dark:text-ink-200">{r.path}</span>
            <span className="shrink-0 text-xs text-ink-400 dark:text-ink-500">{r.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightsPanel() {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 sm:p-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatBlock label="Files" value="1,482" />
        <StatBlock label="Modules" value="32" />
        <StatBlock label="Imports" value="918" />
        <StatBlock label="Confidence" value="96%" />
      </div>
      <div className="flex flex-col gap-3">
        <ProportionBar label="TypeScript" count={1008} countLabel="1,008 files" total={1482} />
        <ProportionBar label="Python" count={326} countLabel="326 files" total={1482} />
        <ProportionBar label="Other" count={148} countLabel="148 files" total={1482} />
      </div>
    </div>
  );
}

const TABS = [
  { key: "briefing", label: "Briefing", icon: IconBriefing, Panel: BriefingPanel },
  { key: "atlas", label: "Atlas", icon: IconArchitecture, Panel: AtlasPanel },
  { key: "threads", label: "Threads", icon: IconThreads, Panel: ThreadsPanel },
  { key: "search", label: "Search", icon: IconSearch, Panel: SearchPanel },
  { key: "insights", label: "Insights", icon: IconInsights, Panel: InsightsPanel },
] as const;

export function ProductPreview() {
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("briefing");
  const reduceMotion = useReducedMotion();
  const activeTab = TABS.find((t) => t.key === active) ?? TABS[0];

  return (
    <section id="product-preview" className="relative z-10 scroll-mt-28 px-6 py-24 lg:px-12 lg:py-32">
      <div className="mx-auto max-w-5xl">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <h2
            className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl xl:text-5xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            One workspace, every room open.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            The same study, read five ways — the architect&apos;s thesis, the shape of the system,
            an open question, a search, the evidence underneath.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="mt-14">
          <Surface padding="sm" className="!p-0 overflow-hidden" as="div">
            {/* Browser chrome */}
            <div className="flex items-center gap-3 border-b border-ink-950/6 px-5 py-3.5 dark:border-white/8">
              <div className="flex gap-1.5" aria-hidden>
                <span className="size-2.5 rounded-full bg-ink-950/15 dark:bg-white/15" />
                <span className="size-2.5 rounded-full bg-ink-950/15 dark:bg-white/15" />
                <span className="size-2.5 rounded-full bg-ink-950/15 dark:bg-white/15" />
              </div>
              <div className="mx-auto flex items-center gap-1.5 rounded-full bg-ink-950/[0.04] px-4 py-1 text-xs text-ink-500 dark:bg-white/8 dark:text-ink-400">
                <span className="font-mono">blueprint.dev/repo/atlas-core</span>
              </div>
              <div className="w-[42px]" aria-hidden />
            </div>

            {/* Tabs */}
            <div role="tablist" aria-label="Blueprint rooms" className="flex gap-1 overflow-x-auto border-b border-ink-950/6 px-3 py-2 dark:border-white/8">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  role="tab"
                  type="button"
                  aria-selected={active === tab.key}
                  onClick={() => setActive(tab.key)}
                  className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active === tab.key
                      ? "bg-accent-50 text-accent-700 dark:bg-accent-700/20 dark:text-accent-400"
                      : "text-ink-500 hover:bg-ink-950/5 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/8 dark:hover:text-ink-100"
                  }`}
                >
                  <tab.icon className="size-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Panel */}
            <div role="tabpanel" className="relative h-[420px] overflow-hidden sm:h-[380px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
                  transition={{ duration: 0.32, ease: "easeOut" }}
                  className="absolute inset-0"
                >
                  <activeTab.Panel />
                </motion.div>
              </AnimatePresence>
            </div>
          </Surface>
        </ScrollReveal>
      </div>
    </section>
  );
}
