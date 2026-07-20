import type { Metadata } from "next";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { ContactForm } from "@/components/landing/ContactForm";
import { ContactFAQ } from "@/components/landing/ContactFAQ";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { IconClock, IconGitHub, IconUsers } from "@/components/workspace/icons";

export const metadata: Metadata = {
  title: "Contact — Blueprint",
  description: "Reach the team building Blueprint.",
};

export default function ContactPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <ScrollReveal>
            <p className="text-sm font-medium text-ink-500 dark:text-ink-400">Contact</p>
            <h1
              className="mt-3 text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl xl:text-6xl dark:text-ink-50"
              style={{ textWrap: "balance" }}
            >
              Tell us what you&apos;re building.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-500 dark:text-ink-400">
              Questions about access, a repository that isn&apos;t indexing the way you&apos;d
              expect, or something you wish the workspace did — this reaches the people building it
              directly.
            </p>

            <div className="mt-10 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="glass edge-light flex size-9 shrink-0 items-center justify-center rounded-lg text-accent-600 dark:text-accent-400">
                  <IconClock className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink-950 dark:text-ink-50">
                    Usually within 1–2 business days
                  </p>
                  <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
                    A small, pre-launch team replies personally — that&apos;s also why it&apos;s not
                    instant.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="glass edge-light flex size-9 shrink-0 items-center justify-center rounded-lg text-accent-600 dark:text-accent-400">
                  <IconUsers className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink-950 dark:text-ink-50">
                    A person, not a queue
                  </p>
                  <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
                    No ticketing system yet — every message here goes straight to the team building
                    Blueprint.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="glass edge-light flex size-9 shrink-0 items-center justify-center rounded-lg text-accent-600 dark:text-accent-400">
                  <IconGitHub className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink-950 dark:text-ink-50">
                    Prefer GitHub?
                  </p>
                  <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
                    <a
                      href="https://github.com"
                      className="text-accent-600 underline decoration-accent-600/30 underline-offset-2 hover:decoration-accent-600 dark:text-accent-400 dark:decoration-accent-400/30 dark:hover:decoration-accent-400"
                    >
                      Find us there
                    </a>{" "}
                    too — the form is just the fastest path today.
                  </p>
                </div>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <ContactForm />
          </ScrollReveal>
        </div>

        <ScrollReveal delay={0.15} className="mx-auto mt-24 max-w-2xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl dark:text-ink-50">
            Before you write in
          </h2>
          <p className="mt-3 text-center text-sm leading-relaxed text-ink-500 dark:text-ink-400">
            A few of the questions this form gets most.
          </p>
          <div className="mt-10">
            <ContactFAQ />
          </div>
        </ScrollReveal>
      </div>
    </MarketingShell>
  );
}
