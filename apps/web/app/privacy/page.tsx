import type { Metadata } from "next";
import { Surface } from "@blueprint/ui";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

export const metadata: Metadata = {
  title: "Privacy — Blueprint",
  description: "How Blueprint accesses, stores, and deletes repository data.",
};

const SECTIONS = [
  {
    title: "What we access",
    body: "Blueprint reads repository contents through a GitHub App installation you explicitly grant, scoped only to the repositories you connect. Access is read-only — nothing is ever written back to a connected repository.",
  },
  {
    title: "What we store",
    body: "For each connected repository, Blueprint stores the parsed file and import graph, the generated Briefing, and account details needed to authenticate you. We don't store repository contents beyond what's needed to keep that graph current.",
  },
  {
    title: "Training",
    body: "Code you connect is never used to train a shared model. Analysis runs per-repository and stays scoped to your workspace.",
  },
  {
    title: "Disconnecting",
    body: "Revoking the GitHub App installation, or disconnecting a repository from within Blueprint, deletes its indexed graph and generated Briefing from our storage.",
  },
  {
    title: "Contact",
    body: "Questions about this policy can go to our contact page, and we'll respond directly.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl">
        <ScrollReveal>
          <p className="text-sm font-medium text-ink-500 dark:text-ink-400">Legal</p>
          <h1
            className="mt-3 text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            Privacy policy.
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
