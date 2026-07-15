import type { Metadata } from "next";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { ContactForm } from "@/components/landing/ContactForm";
import { ScrollReveal } from "@/components/landing/ScrollReveal";

export const metadata: Metadata = {
  title: "Contact — Blueprint",
  description: "Reach the team building Blueprint.",
};

export default function ContactPage() {
  return (
    <MarketingShell>
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
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
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <ContactForm />
        </ScrollReveal>
      </div>
    </MarketingShell>
  );
}
