"use client";

import { Surface, Tilt } from "@blueprint/ui";
import { ScrollReveal, ScrollStagger } from "./ScrollReveal";
import { IconArchitecture, IconGraph, IconOverview } from "@/components/workspace/icons";

const NODES = [
  { id: "graph-engine", x: 50, y: 50, r: 5.4, ring: 0 },
  { id: "ingest", x: 24, y: 26, r: 3, ring: 1 },
  { id: "briefing", x: 74, y: 22, r: 3, ring: 1 },
  { id: "atlas", x: 82, y: 58, r: 3, ring: 1 },
  { id: "insights", x: 20, y: 66, r: 2.4, ring: 1 },
  { id: "threads", x: 40, y: 86, r: 2.2, ring: 2 },
  { id: "workspace-ui", x: 66, y: 88, r: 2.2, ring: 2 },
  { id: "cli", x: 90, y: 82, r: 2, ring: 2 },
  { id: "eval", x: 10, y: 40, r: 2, ring: 2 },
] as const;

const EDGES: [string, string][] = [
  ["graph-engine", "ingest"],
  ["graph-engine", "briefing"],
  ["graph-engine", "atlas"],
  ["graph-engine", "insights"],
  ["briefing", "threads"],
  ["atlas", "workspace-ui"],
  ["atlas", "cli"],
  ["ingest", "eval"],
];

const LIVE_EDGES = new Set(["graph-engine-ingest", "graph-engine-atlas"]);

function findNode(id: string) {
  return NODES.find((n) => n.id === id)!;
}

const CALLOUTS = [
  {
    icon: IconGraph,
    title: "Dependency relationships",
    description: "Every import becomes a traced edge — real, resolved, and clickable back to the line that created it.",
  },
  {
    icon: IconArchitecture,
    title: "Module hierarchy",
    description: "Ring position is distance from the keystone, not a layout algorithm's opinion.",
  },
  {
    icon: IconOverview,
    title: "Repository structure",
    description: "One graph, every scale — from the whole system down to a single file's neighbors.",
  },
];

export function ArchitectureExplorer() {
  return (
    <section id="architecture" className="relative z-10 scroll-mt-28 px-6 py-24 lg:px-12 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <h2
            className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl xl:text-5xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            The Atlas: your system, drawn honestly.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            Not a force-directed layout guessing at meaning — a deterministic map, keystone at the
            center, everything else positioned by how far it actually is.
          </p>
        </ScrollReveal>

        <div className="mt-14 grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <ScrollReveal delay={0.05}>
            <Tilt maxTilt={2} glare className="block">
              <Surface padding="lg" className="aspect-square w-full">
                <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
                  {EDGES.map(([a, b]) => {
                    const from = findNode(a);
                    const to = findNode(b);
                    const live = LIVE_EDGES.has(`${a}-${b}`);
                    return (
                      <line
                        key={`${a}-${b}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={live ? "var(--color-accent-500)" : "currentColor"}
                        strokeWidth={live ? 0.7 : 0.5}
                        strokeDasharray={live ? "6 10" : undefined}
                        className={live ? "graph-edge-flow" : "text-ink-950/15 dark:text-white/15"}
                      />
                    );
                  })}
                  {NODES.map((n) => (
                    <g key={n.id}>
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={n.r}
                        fill={n.ring === 0 ? "var(--color-accent-500)" : "currentColor"}
                        className={n.ring === 0 ? "" : "text-ink-950/45 dark:text-white/45"}
                      />
                      <text
                        x={n.x}
                        y={n.y + n.r + 4.5}
                        textAnchor="middle"
                        className="fill-ink-500 dark:fill-ink-400"
                        style={{ fontSize: 3.1, fontFamily: "var(--font-mono)" }}
                      >
                        {n.id}
                      </text>
                    </g>
                  ))}
                </svg>
              </Surface>
            </Tilt>
          </ScrollReveal>

          <ScrollStagger className="flex flex-col gap-8" stagger={0.1}>
            {CALLOUTS.map((c) => (
              <div key={c.title} className="flex gap-4">
                <span className="glass edge-light flex size-11 shrink-0 items-center justify-center rounded-xl text-accent-600 dark:text-accent-400">
                  <c.icon className="size-5" />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-base font-semibold text-ink-950 dark:text-ink-50">{c.title}</h3>
                  <p className="text-sm leading-relaxed text-ink-500 dark:text-ink-400">{c.description}</p>
                </div>
              </div>
            ))}
          </ScrollStagger>
        </div>
      </div>
    </section>
  );
}
