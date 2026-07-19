import Link from "next/link";
import type { Confidence } from "@/lib/insights";
import { Surface, Tilt } from "@blueprint/ui";
import { ConfidenceMark } from "@/components/study/Confidence";
import { IconArrowRight, IconSpark } from "./icons";

const TIER_ORDER: Confidence[] = ["measured", "likely", "undetermined"];

/** A door into "The read" below — not a second copy of the thesis
 * (that already leads the page as the h1), the one thing not yet
 * visible: how the claims underneath it break down by confidence. */
export function AIBriefingCard({
  claimCount,
  measuredCount,
  likelyCount,
  undeterminedCount,
}: {
  claimCount: number;
  measuredCount: number;
  likelyCount: number;
  undeterminedCount: number;
}) {
  const counts: Record<Confidence, number> = {
    measured: measuredCount,
    likely: likelyCount,
    undetermined: undeterminedCount,
  };

  return (
    <Tilt maxTilt={3}>
      <Surface padding="md" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink-950 dark:text-ink-50">The Read</h3>
          <span className="flex size-6 items-center justify-center rounded-full bg-accent-50 text-accent-600 dark:bg-accent-700/20 dark:text-accent-400">
            <IconSpark className="size-3.5" />
          </span>
        </div>

        <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">
          {claimCount === 0
            ? "No claims yet — the study didn't produce a read to stand behind."
            : `${claimCount} ${claimCount === 1 ? "claim" : "claims"} below, each traced to source.`}
        </p>

        {claimCount > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {TIER_ORDER.filter((tier) => counts[tier] > 0).map((tier) => (
              <span key={tier} className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-ink-800 dark:text-ink-200">
                  {counts[tier]}
                </span>
                <ConfidenceMark confidence={tier} />
              </span>
            ))}
          </div>
        ) : null}

        <Link
          href="#the-read"
          className="group mt-auto inline-flex w-fit items-center gap-1.5 text-sm font-medium text-accent-600 transition-colors hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-200"
        >
          Read the full briefing
          <IconArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
        </Link>
      </Surface>
    </Tilt>
  );
}
