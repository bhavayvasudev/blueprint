import type { ThreadStatus } from "@blueprint/shared-types";

/** An investigation's disposition (PRODUCT-spec: threads carry a status).
 * Status is never color-alone (PRODUCT.md accessibility) — the dot is
 * always paired with a label, and each has a distinct shape/fill so it
 * reads without color too. */
const STATUS: Record<ThreadStatus, { label: string; dot: string; text: string }> = {
  answered: {
    label: "Answered",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  exploring: {
    label: "Exploring",
    dot: "bg-accent-500",
    text: "text-accent-600 dark:text-accent-400",
  },
  needs_context: {
    label: "Needs context",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  blocked: {
    label: "Blocked",
    dot: "bg-rose-500 ring-2 ring-rose-500/30",
    text: "text-rose-600 dark:text-rose-400",
  },
};

export function ThreadStatusBadge({
  status,
  withLabel = true,
}: {
  status: ThreadStatus;
  withLabel?: boolean;
}) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5" title={s.label}>
      <span className={`size-1.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
      {withLabel ? (
        <span className={`text-[0.7rem] font-medium ${s.text}`}>{s.label}</span>
      ) : (
        <span className="sr-only">{s.label}</span>
      )}
    </span>
  );
}
