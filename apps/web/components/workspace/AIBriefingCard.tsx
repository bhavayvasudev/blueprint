import Link from "next/link";
import { Surface } from "@blueprint/ui";
import { IconArrowRight, IconSpark } from "./icons";

/** The thesis, excerpted — not a second copy of the Briefing's claim,
 * a door into it. The excerpt is the same sentence the page states in
 * full below; nothing here is generated separately from what the rest
 * of the page already says. */
export function AIBriefingCard({ excerpt, hasMore }: { excerpt: string; hasMore: boolean }) {
  return (
    <Surface padding="md" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink-950 dark:text-ink-50">AI Briefing</h3>
        <span className="flex size-6 items-center justify-center rounded-full bg-accent-50 text-accent-600 dark:bg-accent-700/20 dark:text-accent-400">
          <IconSpark className="size-3.5" />
        </span>
      </div>

      <p className="line-clamp-5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{excerpt}</p>

      <Link
        href="#the-read"
        className="group mt-auto inline-flex w-fit items-center gap-1.5 text-sm font-medium text-accent-600 transition-colors hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-200"
      >
        {hasMore ? "View full briefing" : "Read the briefing"}
        <IconArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
      </Link>
    </Surface>
  );
}
