import Link from "next/link";
import { Fragment } from "react";
import type { Segment } from "@/lib/insights";

/** A module label typeset so it only ever line-breaks after a `/` —
 * never mid-word, never at a hyphen — which keeps handles like
 * `packages/shared-types` from shattering inside display type. */
export function ModuleName({ label }: { label: string }) {
  const parts = label.split("/");
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <>
              /<wbr />
            </>
          ) : null}
          <span className="whitespace-nowrap">{part}</span>
        </Fragment>
      ))}
    </>
  );
}

/** Renders a claim sentence whose module names are handles into the
 * Atlas — prose you can tug on, the strategy's "every claim is a
 * handle" made literal. Plain text segments stay text; module segments
 * become links that land on that module, selected, in the Atlas. */
export function ProseSegments({
  segments,
  repositoryId,
}: {
  segments: Segment[];
  repositoryId: string;
}) {
  return (
    <>
      {segments.map((segment, i) =>
        segment.moduleId ? (
          <Link
            key={i}
            href={`/repo/${repositoryId}?focus=${encodeURIComponent(segment.moduleId)}`}
            className="font-mono text-[0.88em] font-medium text-ink-950 underline decoration-accent-400/70 decoration-[1.5px] underline-offset-[5px] transition-colors hover:text-accent-600 hover:decoration-accent-500 dark:text-ink-50 dark:hover:text-accent-400"
          >
            <ModuleName label={segment.text} />
          </Link>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}
