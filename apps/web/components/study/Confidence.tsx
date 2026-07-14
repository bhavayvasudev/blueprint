import type { Confidence } from "@/lib/insights";

/** The confidence grammar — "measured", "likely", and "undetermined"
 * are three structurally distinct statements (PRODUCT.md: calibrated,
 * not confident), so they get three distinct marks: a filled diamond, a
 * half-filled diamond, and an empty one. Shape + label carry the
 * meaning; color never does it alone. */
const MARK: Record<Confidence, { label: string; fill: React.ReactNode }> = {
  measured: {
    label: "Measured",
    fill: <path d="M7 1.2 12.8 7 7 12.8 1.2 7Z" fill="currentColor" />,
  },
  likely: {
    label: "Likely",
    fill: (
      <>
        <path d="M7 1.2 12.8 7 7 12.8 1.2 7Z" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <path d="M7 1.2 12.8 7 7 12.8Z" fill="currentColor" />
      </>
    ),
  },
  undetermined: {
    label: "Undetermined",
    fill: <path d="M7 1.2 12.8 7 7 12.8 1.2 7Z" stroke="currentColor" strokeWidth="1.3" fill="none" />,
  },
};

export function ConfidenceMark({ confidence }: { confidence: Confidence }) {
  const mark = MARK[confidence];
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-500 dark:text-ink-400">
      <svg viewBox="0 0 14 14" className="size-2.5 shrink-0" aria-hidden>
        {mark.fill}
      </svg>
      <span className="text-xs font-medium tracking-wide">{mark.label}</span>
    </span>
  );
}
