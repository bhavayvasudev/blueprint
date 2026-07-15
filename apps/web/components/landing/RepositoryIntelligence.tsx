"use client";

import { Badge, Float, ProportionBar, StatBlock, Surface } from "@blueprint/ui";
import { CountUp } from "./CountUp";
import { ScrollReveal } from "./ScrollReveal";

export function RepositoryIntelligence() {
  return (
    <section id="intelligence" className="relative z-10 scroll-mt-28 px-6 py-24 lg:px-12 lg:py-32">
      <div className="mx-auto max-w-5xl">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full bg-ink-950/5 px-3 py-1 text-xs font-medium text-ink-500 dark:bg-white/8 dark:text-ink-400">
            Worked example
          </span>
          <h2
            className="mt-4 text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl xl:text-5xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            The evidence, on its own.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            This is the shape of a real evidence panel — every figure here is counted, never
            synthesized, once a repository is indexed. The numbers below are a worked example, not
            a claim about any specific repository.
          </p>
        </ScrollReveal>

        <div className="mt-16 grid grid-cols-2 gap-5 md:grid-cols-4">
          <ScrollReveal delay={0}>
            <Float amplitude={7} duration={7.5}>
              <Surface padding="md" className="h-full">
                <StatBlock label="Keystone module" value="graph-engine" detail="highest in-degree, 6 dependents" />
              </Surface>
            </Float>
          </ScrollReveal>

          <ScrollReveal delay={0.06}>
            <Float amplitude={8} duration={8}>
              <Surface padding="md" className="h-full">
                <StatBlock
                  label="Complexity"
                  value={<CountUp value={6} suffix=" hotspots" />}
                  detail="above the cyclomatic threshold"
                />
              </Surface>
            </Float>
          </ScrollReveal>

          <ScrollReveal delay={0.12}>
            <Float amplitude={6} duration={7}>
              <Surface padding="md" className="h-full">
                <StatBlock
                  label="Dependencies"
                  value={<CountUp value={247} suffix=" imports" />}
                  detail="across 32 packages"
                />
              </Surface>
            </Float>
          </ScrollReveal>

          <ScrollReveal delay={0.18}>
            <Float amplitude={7} duration={8.5}>
              <Surface padding="md" className="flex h-full flex-col justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">
                  Security findings
                </span>
                <Badge tone="failed">3 findings · 1 high</Badge>
              </Surface>
            </Float>
          </ScrollReveal>

          <ScrollReveal delay={0.24} className="md:col-span-2">
            <Surface padding="md" className="h-full">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">
                Languages
              </span>
              <div className="mt-4 flex flex-col gap-3">
                <ProportionBar label="TypeScript" count={1008} countLabel="1,008 files" total={1482} />
                <ProportionBar label="Python" count={326} countLabel="326 files" total={1482} />
                <ProportionBar label="Other" count={148} countLabel="148 files" total={1482} />
              </div>
            </Surface>
          </ScrollReveal>

          <ScrollReveal delay={0.3}>
            <Float amplitude={6} duration={7.2}>
              <Surface padding="md" className="h-full">
                <StatBlock
                  label="Dead code"
                  value={<CountUp value={12} suffix=" exports" />}
                  detail="unreferenced from any import"
                />
              </Surface>
            </Float>
          </ScrollReveal>

          <ScrollReveal delay={0.36}>
            <Float amplitude={8} duration={8.2}>
              <Surface padding="md" className="h-full">
                <StatBlock
                  label="Unused packages"
                  value={<CountUp value={4} suffix=" packages" />}
                  detail="declared, never imported"
                />
              </Surface>
            </Float>
          </ScrollReveal>

          <ScrollReveal delay={0.42}>
            <Float amplitude={7} duration={7.8}>
              <Surface padding="md" className="flex h-full flex-col justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">
                  Circular dependencies
                </span>
                <div className="flex items-center gap-2">
                  <Badge tone="failed">1 cycle</Badge>
                  <span className="font-mono text-xs text-ink-500 dark:text-ink-400">ingest ↔ briefing</span>
                </div>
              </Surface>
            </Float>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
