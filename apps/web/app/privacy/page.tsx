import type { Metadata } from "next";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { ReadingProgress, TableOfContents } from "@/components/landing/TableOfContents";

export const metadata: Metadata = {
  title: "Privacy — Blueprint",
  description: "How Blueprint accesses, stores, and deletes repository data.",
};

const LAST_UPDATED = "2026-07-20";

const SECTIONS = [
  {
    id: "what-we-access",
    title: "What we access",
    body: "Blueprint reads repository contents through a GitHub App installation you explicitly grant, scoped only to the repositories you connect. Access is read-only — nothing is ever written back to a connected repository.",
  },
  {
    id: "what-we-store",
    title: "What we store",
    body: "For each connected repository, Blueprint stores the parsed file and import graph, the generated Briefing, and account details needed to authenticate you. We don't store repository contents beyond what's needed to keep that graph current.",
  },
  {
    id: "training",
    title: "Training",
    body: "Code you connect is never used to train a shared model. Analysis runs per-repository and stays scoped to your workspace.",
  },
  {
    id: "disconnecting",
    title: "Disconnecting",
    body: "Revoking the GitHub App installation, or disconnecting a repository from within Blueprint, deletes its indexed graph and generated Briefing from our storage.",
  },
  {
    id: "contact",
    title: "Contact",
    body: "Questions about this policy can go to our contact page, and we'll respond directly.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <ReadingProgress />
      <div className="mx-auto max-w-5xl">
        <ScrollReveal>
          <p className="text-sm font-medium text-ink-500 dark:text-ink-400">Legal</p>
          <h1
            className="mt-3 text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            Privacy policy.
          </h1>
          <p className="mt-4 text-xs font-medium tracking-wide text-ink-400 uppercase dark:text-ink-500">
            Last updated {new Date(LAST_UPDATED).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-500 dark:text-ink-400">
            Draft — Blueprint is pre-launch, and this page will be finalized as formal legal copy
            before general availability. It describes our actual current practice today.
          </p>
        </ScrollReveal>

        <div className="mt-14 flex items-start gap-16">
          <div className="min-w-0 flex-1 max-w-2xl">
            {SECTIONS.map((section, index) => (
              <ScrollReveal key={section.id} delay={index * 0.04}>
                <section id={section.id} className="scroll-mt-32 border-t border-ink-950/8 py-8 first:border-t-0 first:pt-0 dark:border-white/10">
                  <h2 className="text-lg font-semibold text-ink-950 dark:text-ink-50">{section.title}</h2>
                  <p className="mt-2.5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{section.body}</p>
                </section>
              </ScrollReveal>
            ))}
          </div>

          <TableOfContents sections={SECTIONS.map(({ id, title }) => ({ id, title }))} />
        </div>
      </div>
    </MarketingShell>
  );
}
