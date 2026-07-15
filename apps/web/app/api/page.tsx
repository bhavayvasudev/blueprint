import type { Metadata } from "next";
import { Surface } from "@blueprint/ui";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { IconClock } from "@/components/workspace/icons";

export const metadata: Metadata = {
  title: "API — Blueprint",
  description: "A public API for Blueprint's knowledge graph is planned but not yet available.",
};

export default function ApiPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl">
        <ScrollReveal className="text-center">
          <p className="text-sm font-medium text-ink-500 dark:text-ink-400">API reference</p>
          <h1
            className="mt-3 text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl xl:text-6xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            Not published yet.
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            A public API for querying the knowledge graph directly — modules, dependencies,
            confidence scores — is planned. Today, Blueprint is reachable through the workspace
            only.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="mt-14">
          <Surface padding="lg" className="!p-0 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-ink-950/6 px-5 py-3.5 dark:border-white/8">
              <div className="flex gap-1.5" aria-hidden>
                <span className="size-2.5 rounded-full bg-ink-950/15 dark:bg-white/15" />
                <span className="size-2.5 rounded-full bg-ink-950/15 dark:bg-white/15" />
                <span className="size-2.5 rounded-full bg-ink-950/15 dark:bg-white/15" />
              </div>
              <span className="mx-auto text-xs text-ink-500 dark:text-ink-400">illustrative, not live</span>
            </div>
            <pre className="overflow-x-auto p-6 font-mono text-xs leading-relaxed text-ink-700 sm:text-sm dark:text-ink-300">
{`GET /v1/repositories/{id}/modules
GET /v1/repositories/{id}/modules/{moduleId}/dependencies
GET /v1/repositories/{id}/confidence

# Shape of what's planned — not a live endpoint today.`}
            </pre>
          </Surface>
        </ScrollReveal>

        <ScrollReveal delay={0.2} className="mt-10">
          <Surface padding="lg" className="flex flex-col items-center gap-3 text-center">
            <span className="glass edge-light flex size-11 items-center justify-center rounded-full text-accent-600 dark:text-accent-400">
              <IconClock className="size-5" />
            </span>
            <h2 className="text-lg font-semibold text-ink-950 dark:text-ink-50">Building something that needs this?</h2>
            <p className="max-w-md text-sm leading-relaxed text-ink-500 dark:text-ink-400">
              Tell us what you&apos;re trying to do and we&apos;ll factor it into how the API takes
              shape.
            </p>
            <a
              href="/contact"
              className="mt-1 inline-flex items-center gap-2 rounded-full bg-ink-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-800 dark:bg-white dark:text-ink-950 dark:hover:bg-ink-100"
            >
              Contact us
            </a>
          </Surface>
        </ScrollReveal>
      </div>
    </MarketingShell>
  );
}
