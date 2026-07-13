import type { ReactNode } from "react";

export interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** The document-section header — every top-level section of the
 * Architecture View (and, later, the Repository Intelligence View)
 * opens with one of these, which is what makes the page read as a
 * continuous document with inline diagrams rather than a dashboard of
 * disconnected widgets (RULES.md §18, PRD.md §8). */
export function SectionHeading({ eyebrow, title, description, action }: SectionHeadingProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        {eyebrow ? (
          <span className="text-xs font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-400">
            {eyebrow}
          </span>
        ) : null}
        <h2 className="text-xl font-semibold tracking-tight text-ink-950 dark:text-ink-50">{title}</h2>
        {description ? (
          <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
