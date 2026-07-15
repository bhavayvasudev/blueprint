import type { Metadata } from "next";
import { Surface } from "@blueprint/ui";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { IconClock } from "@/components/workspace/icons";

export const metadata: Metadata = {
  title: "Changelog — Blueprint",
  description: "What's shipped in Blueprint, as it ships.",
};

export default function ChangelogPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl">
        <ScrollReveal className="text-center">
          <p className="text-sm font-medium text-ink-500 dark:text-ink-400">Changelog</p>
          <h1
            className="mt-3 text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl xl:text-6xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            Nothing published yet.
          </h1>
          <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            Blueprint is pre-launch. Once releases start shipping to everyone, they&apos;ll be
            listed here — newest first, plainly described.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="mt-14">
          <Surface padding="lg" className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="glass edge-light flex size-12 items-center justify-center rounded-full text-ink-400 dark:text-ink-500">
              <IconClock className="size-5" />
            </span>
            <p className="text-sm text-ink-500 dark:text-ink-400">
              No entries yet — check back after the first release.
            </p>
          </Surface>
        </ScrollReveal>
      </div>
    </MarketingShell>
  );
}
