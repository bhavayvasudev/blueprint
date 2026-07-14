/** The Briefing's section grammar: a small heading that hands off to a
 * hairline — a surveyor's rule across the page, deliberately not the
 * uppercase-tracked eyebrow every dashboard reaches for. */
export function SectionRule({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-5">
      <h2 className="shrink-0 text-sm font-medium text-ink-500 dark:text-ink-400">{children}</h2>
      <span aria-hidden className="h-px flex-1 self-center bg-ink-950/8 dark:bg-white/8" />
    </div>
  );
}
