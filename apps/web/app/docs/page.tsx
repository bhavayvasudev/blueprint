import type { Metadata } from "next";
import { Surface } from "@blueprint/ui";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { ScrollReveal, ScrollStagger } from "@/components/landing/ScrollReveal";
import {
  IconArchitecture,
  IconBriefing,
  IconGitHub,
  IconInsights,
  IconSearch,
  IconThreads,
} from "@/components/workspace/icons";

export const metadata: Metadata = {
  title: "Docs — Blueprint",
  description: "How Blueprint connects to a repository and what each room of the workspace shows.",
};

const TOPICS = [
  {
    icon: IconGitHub,
    title: "Connecting a repository",
    description:
      "Blueprint reads code through a GitHub App installation — read-only, no personal access tokens, scoped to the repositories you explicitly grant. Revoke access from GitHub at any time.",
  },
  {
    icon: IconBriefing,
    title: "The Briefing",
    description:
      "The architect's read of your codebase as prose: a thesis about what's load-bearing, what cycles exist, and where the risk concentrates — every claim linked to the code that supports it.",
  },
  {
    icon: IconArchitecture,
    title: "The Atlas",
    description:
      "The system drawn as a deterministic map — modules positioned by dependency distance from the keystone, not a force-directed layout guessing at meaning.",
  },
  {
    icon: IconInsights,
    title: "Insights",
    description:
      "The same study read as evidence: real, counted figures — files, imports, languages, cycles — never a synthesized score standing in for a claim.",
  },
  {
    icon: IconThreads,
    title: "Threads",
    description:
      "Open questions about the codebase, answered with citations to the exact files and functions behind them. In active development.",
  },
  {
    icon: IconSearch,
    title: "Confidence grammar",
    description:
      "Every claim is measured, likely, or undetermined, based on how directly it traces to parsed source — downgraded automatically when parse coverage is incomplete, never rounded up.",
  },
] as const;

export default function DocsPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-4xl">
        <ScrollReveal>
          <p className="text-sm font-medium text-ink-500 dark:text-ink-400">Documentation</p>
          <h1
            className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl xl:text-6xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            How the workspace is put together.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            A short reference for what each room shows and where its numbers come from. Full
            guides are still being written — this page will grow into them.
          </p>
        </ScrollReveal>

        <ScrollStagger className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2" stagger={0.06}>
          {TOPICS.map((topic) => (
            <Surface key={topic.title} padding="lg" className="flex h-full flex-col gap-4">
              <span className="glass edge-light flex size-11 shrink-0 items-center justify-center rounded-xl text-accent-600 dark:text-accent-400">
                <topic.icon className="size-5" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-base font-semibold text-ink-950 dark:text-ink-50">{topic.title}</h2>
                <p className="text-sm leading-relaxed text-ink-500 dark:text-ink-400">{topic.description}</p>
              </div>
            </Surface>
          ))}
        </ScrollStagger>

        <ScrollReveal delay={0.1} className="mt-16">
          <Surface padding="lg" className="flex flex-col items-start gap-3">
            <h2 className="text-lg font-semibold text-ink-950 dark:text-ink-50">Looking for something specific?</h2>
            <p className="max-w-xl text-sm leading-relaxed text-ink-500 dark:text-ink-400">
              Detailed guides per room, the parser confidence model, and API reference are on the
              way. In the meantime, reach out and we&apos;ll point you in the right direction.
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
