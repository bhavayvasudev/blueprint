import type { Metadata } from "next";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { ChangelogTimeline, type ChangelogEntry } from "@/components/landing/ChangelogTimeline";
import { IconClock } from "@/components/workspace/icons";

export const metadata: Metadata = {
  title: "Changelog — Blueprint",
  description: "What's shipped in Blueprint, as it ships.",
};

// Blueprint is pre-launch — nothing has shipped to general availability
// yet, so this stays empty rather than listing internal dev-branch
// activity as if it were a release. The first real entry lands here at
// general availability.
const ENTRIES: ChangelogEntry[] = [];

export default function ChangelogPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl">
        <ScrollReveal>
          <p className="text-sm font-medium text-ink-500 dark:text-ink-400">Changelog</p>
          <h1
            className="mt-3 text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl xl:text-6xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            Nothing shipped yet.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            Blueprint is pre-launch. Once releases start shipping to everyone, they&apos;ll be
            listed here — newest first, plainly described, filterable by type.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.08} className="mt-8">
          <div className="glass edge-light flex items-center gap-3 rounded-2xl px-5 py-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-400 dark:text-ink-500">
              <IconClock className="size-4.5" />
            </span>
            <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">
              <span className="font-medium text-ink-950 dark:text-ink-50">Pre-launch.</span>{" "}
              Building in the open, before a general-availability release.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.14} className="mt-14">
          <ChangelogTimeline entries={ENTRIES} />
        </ScrollReveal>
      </div>
    </MarketingShell>
  );
}
