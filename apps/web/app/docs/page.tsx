import type { Metadata } from "next";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { DocsSidebar } from "@/components/landing/DocsSidebar";
import { CodeBlock } from "@/components/landing/CodeBlock";
import { Callout } from "@/components/landing/Callout";
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

const SECTIONS = [
  { id: "overview", title: "Overview" },
  { id: "connecting", title: "Connecting a repository" },
  { id: "briefing", title: "The Briefing" },
  { id: "atlas", title: "The Atlas" },
  { id: "insights", title: "Insights" },
  { id: "threads", title: "Threads" },
  { id: "confidence", title: "Confidence grammar" },
] as const;

const SCOPE_SNIPPET = `GitHub App installation — read-only
  ✓ Repository contents (parses the file & import graph)
  ✓ Metadata (branches, default branch, visibility)
  ✗ Nothing is ever written back to a connected repository
  ✗ Code is never used to train a shared model`;

const CONFIDENCE_SNIPPET = `◆ measured      directly verified against parsed source
◐ likely        inferred with high confidence, not fully verified
◇ undetermined  parse coverage was incomplete for this claim`;

export default function DocsPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl">
        <ScrollReveal>
          <p className="text-sm font-medium text-ink-500 dark:text-ink-400">
            <span className="text-ink-400 dark:text-ink-500">Docs</span>
            <span className="mx-2 text-ink-300 dark:text-ink-700">/</span>
            Overview
          </p>
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

        <div className="mt-16 flex flex-col gap-16 lg:flex-row lg:items-start lg:gap-16">
          <DocsSidebar sections={[...SECTIONS]} />

          <div className="min-w-0 flex-1 lg:max-w-2xl">
            <ScrollReveal>
              <section id="overview" className="scroll-mt-32">
                <h2 className="text-xl font-semibold text-ink-950 dark:text-ink-50">Overview</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  Blueprint reads a connected repository, builds a real file and import graph from
                  it, and presents that graph through four rooms: a written Briefing, a visual
                  Atlas, counted Insights, and — coming soon — Threads for open questions. Every
                  claim any room makes traces back to parsed source, never a synthesized score.
                </p>
              </section>
            </ScrollReveal>

            <ScrollReveal delay={0.05}>
              <section id="connecting" className="mt-14 scroll-mt-32">
                <div className="flex items-center gap-3">
                  <span className="glass edge-light flex size-9 shrink-0 items-center justify-center rounded-lg text-accent-600 dark:text-accent-400">
                    <IconGitHub className="size-4" />
                  </span>
                  <h2 className="text-xl font-semibold text-ink-950 dark:text-ink-50">
                    Connecting a repository
                  </h2>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  Blueprint reads code through a GitHub App installation — read-only, no personal
                  access tokens, scoped to the repositories you explicitly grant.
                </p>
                <CodeBlock code={SCOPE_SNIPPET} label="permissions" className="mt-4" />
                <Callout tone="info" title="Revoking access" className="mt-4">
                  Revoke the installation from GitHub at any time — Blueprint stops reading
                  immediately, and disconnecting a repository from the workspace deletes its
                  indexed graph.
                </Callout>
              </section>
            </ScrollReveal>

            <ScrollReveal delay={0.05}>
              <section id="briefing" className="mt-14 scroll-mt-32">
                <div className="flex items-center gap-3">
                  <span className="glass edge-light flex size-9 shrink-0 items-center justify-center rounded-lg text-accent-600 dark:text-accent-400">
                    <IconBriefing className="size-4" />
                  </span>
                  <h2 className="text-xl font-semibold text-ink-950 dark:text-ink-50">The Briefing</h2>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  The architect&apos;s read of your codebase as prose: a thesis about what&apos;s
                  load-bearing, what cycles exist, and where the risk concentrates — every claim
                  linked to the code that supports it, and graded by the confidence grammar below.
                </p>
              </section>
            </ScrollReveal>

            <ScrollReveal delay={0.05}>
              <section id="atlas" className="mt-14 scroll-mt-32">
                <div className="flex items-center gap-3">
                  <span className="glass edge-light flex size-9 shrink-0 items-center justify-center rounded-lg text-accent-600 dark:text-accent-400">
                    <IconArchitecture className="size-4" />
                  </span>
                  <h2 className="text-xl font-semibold text-ink-950 dark:text-ink-50">The Atlas</h2>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  The system drawn as a deterministic map — modules positioned by dependency
                  distance from the keystone, not a force-directed layout guessing at meaning.
                  Selecting a module focuses it in place; it never summons a separate view.
                </p>
              </section>
            </ScrollReveal>

            <ScrollReveal delay={0.05}>
              <section id="insights" className="mt-14 scroll-mt-32">
                <div className="flex items-center gap-3">
                  <span className="glass edge-light flex size-9 shrink-0 items-center justify-center rounded-lg text-accent-600 dark:text-accent-400">
                    <IconInsights className="size-4" />
                  </span>
                  <h2 className="text-xl font-semibold text-ink-950 dark:text-ink-50">Insights</h2>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  The same study read as evidence: real, counted figures — files, imports,
                  languages, cycles — never a synthesized health score standing in for a claim.
                </p>
              </section>
            </ScrollReveal>

            <ScrollReveal delay={0.05}>
              <section id="threads" className="mt-14 scroll-mt-32">
                <div className="flex items-center gap-3">
                  <span className="glass edge-light flex size-9 shrink-0 items-center justify-center rounded-lg text-accent-600 dark:text-accent-400">
                    <IconThreads className="size-4" />
                  </span>
                  <h2 className="text-xl font-semibold text-ink-950 dark:text-ink-50">Threads</h2>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  Open questions about the codebase, answered with citations to the exact files and
                  functions behind them. Coming soon — not yet available in the workspace.
                </p>
              </section>
            </ScrollReveal>

            <ScrollReveal delay={0.05}>
              <section id="confidence" className="mt-14 scroll-mt-32">
                <div className="flex items-center gap-3">
                  <span className="glass edge-light flex size-9 shrink-0 items-center justify-center rounded-lg text-accent-600 dark:text-accent-400">
                    <IconSearch className="size-4" />
                  </span>
                  <h2 className="text-xl font-semibold text-ink-950 dark:text-ink-50">Confidence grammar</h2>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  Every claim is measured, likely, or undetermined, based on how directly it traces
                  to parsed source — downgraded automatically when parse coverage is incomplete,
                  never rounded up.
                </p>
                <CodeBlock code={CONFIDENCE_SNIPPET} label="legend" className="mt-4" />
              </section>
            </ScrollReveal>

            <ScrollReveal delay={0.1} className="mt-14">
              <div className="glass edge-light flex flex-col items-start gap-3 rounded-2xl p-8">
                <h2 className="text-lg font-semibold text-ink-950 dark:text-ink-50">
                  Looking for something specific?
                </h2>
                <p className="max-w-xl text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                  Detailed guides per room, the parser confidence model, and the API reference are
                  on the way. In the meantime, reach out and we&apos;ll point you in the right
                  direction.
                </p>
                <a
                  href="/contact"
                  className="mt-1 inline-flex items-center gap-2 rounded-full bg-ink-950 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent-500/25 transition-shadow hover:shadow-xl hover:shadow-accent-500/40 dark:bg-white dark:text-ink-950"
                >
                  Contact us
                </a>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
