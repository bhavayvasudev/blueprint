import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { ReadingProgress, TableOfContents } from "@/components/landing/TableOfContents";
import { IconChevronDown } from "@/components/workspace/icons";

export const metadata: Metadata = {
  title: "Terms — Blueprint",
  description: "Terms of use for the Blueprint workspace.",
};

const LAST_UPDATED = "2026-07-20";

const SECTIONS: { id: string; title: string; body: ReactNode; openByDefault?: boolean }[] = [
  {
    id: "using-blueprint",
    title: "Using Blueprint",
    openByDefault: true,
    body: (
      <>
        Blueprint is provided as a tool for understanding codebases you have the right to connect.
        You&apos;re responsible for having authorization to grant Blueprint&apos;s GitHub App
        access to any repository you connect, under{" "}
        <a
          href="https://docs.github.com/en/site-policy/github-terms/github-terms-of-service"
          target="_blank"
          rel="noreferrer"
          className="text-accent-600 underline decoration-accent-600/30 underline-offset-2 hover:decoration-accent-600 dark:text-accent-400 dark:decoration-accent-400/30 dark:hover:decoration-accent-400"
        >
          GitHub&apos;s own terms of service
        </a>
        .
      </>
    ),
  },
  {
    id: "accuracy",
    title: "Accuracy",
    body: "Blueprint states its confidence in every claim — measured, likely, or undetermined — and downgrades automatically when it can't fully parse a file. It aims to be right, but it is not a substitute for your own judgment on code you ship.",
  },
  {
    id: "availability",
    title: "Availability",
    body: "Blueprint is under active development. Features described as in-progress may change before general availability, and we'll be plain about what's real versus planned — see the Changelog for what's actually shipped.",
  },
  {
    id: "termination",
    title: "Termination",
    body: (
      <>
        You can revoke Blueprint&apos;s access at any time through GitHub&apos;s installation
        settings, which stops all further reads immediately and triggers the deletion described in
        the Privacy Policy&apos;s{" "}
        <a href="/privacy#disconnecting" className="text-accent-600 underline decoration-accent-600/30 underline-offset-2 hover:decoration-accent-600 dark:text-accent-400 dark:decoration-accent-400/30 dark:hover:decoration-accent-400">
          Disconnecting
        </a>{" "}
        section.
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <>
        Questions about these terms can go to our{" "}
        <a href="/contact" className="text-accent-600 underline decoration-accent-600/30 underline-offset-2 hover:decoration-accent-600 dark:text-accent-400 dark:decoration-accent-400/30 dark:hover:decoration-accent-400">
          contact page
        </a>
        .
      </>
    ),
  },
];

export default function TermsPage() {
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
            Terms of use.
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
          <div className="min-w-0 max-w-2xl flex-1">
            {SECTIONS.map((section, index) => (
              <ScrollReveal key={section.id} delay={index * 0.04}>
                <details
                  id={section.id}
                  open={section.openByDefault}
                  className="group scroll-mt-32 border-t border-ink-950/8 py-5 first:border-t-0 first:pt-0 dark:border-white/10"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                    <h2 className="text-lg font-semibold text-ink-950 dark:text-ink-50">{section.title}</h2>
                    <IconChevronDown className="size-4 shrink-0 text-ink-400 transition-transform duration-200 group-open:rotate-180 dark:text-ink-500" />
                  </summary>
                  <p className="mt-2.5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{section.body}</p>
                </details>
              </ScrollReveal>
            ))}
          </div>

          <TableOfContents sections={SECTIONS.map(({ id, title }) => ({ id, title }))} />
        </div>
      </div>
    </MarketingShell>
  );
}
