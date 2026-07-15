import type { Metadata } from "next";
import { Surface } from "@blueprint/ui";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

export const metadata: Metadata = {
  title: "Terms — Blueprint",
  description: "Terms of use for the Blueprint workspace.",
};

const SECTIONS = [
  {
    title: "Using Blueprint",
    body: "Blueprint is provided as a tool for understanding codebases you have the right to connect. You're responsible for having authorization to grant Blueprint's GitHub App access to any repository you connect.",
  },
  {
    title: "Accuracy",
    body: "Blueprint states its confidence in every claim — measured, likely, or undetermined — and downgrades automatically when it can't fully parse a file. It aims to be right, but it is not a substitute for your own judgment on code you ship.",
  },
  {
    title: "Availability",
    body: "Blueprint is under active development. Features described as in-progress may change before general availability, and we'll be plain about what's real versus planned.",
  },
  {
    title: "Termination",
    body: "You can revoke Blueprint's access at any time through GitHub's installation settings, which stops all further reads immediately.",
  },
  {
    title: "Contact",
    body: "Questions about these terms can go to our contact page.",
  },
] as const;

export default function TermsPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl">
        <ScrollReveal>
          <p className="text-sm font-medium text-ink-500 dark:text-ink-400">Legal</p>
          <h1
            className="mt-3 text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            Terms of use.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-ink-500 dark:text-ink-400">
            Draft — Blueprint is pre-launch, and this page will be finalized as formal legal copy
            before general availability. It describes our actual current practice today.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="mt-12">
          <Surface padding="lg" className="flex flex-col gap-8">
            {SECTIONS.map((section) => (
              <div key={section.title} className="flex flex-col gap-2">
                <h2 className="text-base font-semibold text-ink-950 dark:text-ink-50">{section.title}</h2>
                <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">{section.body}</p>
              </div>
            ))}
          </Surface>
        </ScrollReveal>
      </div>
    </MarketingShell>
  );
}
