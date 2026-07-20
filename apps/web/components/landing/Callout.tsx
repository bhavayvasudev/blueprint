import type { ReactNode } from "react";
import { IconSpark, IconWarning } from "@/components/workspace/icons";

const TONE = {
  info: {
    icon: IconSpark,
    className:
      "border-accent-500/20 bg-accent-500/[0.06] text-ink-700 dark:border-accent-400/25 dark:bg-accent-400/[0.08] dark:text-ink-200",
    iconClassName: "text-accent-600 dark:text-accent-400",
  },
  warning: {
    icon: IconWarning,
    className:
      "border-status-indexing/30 bg-status-indexing/[0.08] text-ink-700 dark:border-status-indexing/25 dark:bg-status-indexing/[0.1] dark:text-ink-200",
    iconClassName: "text-status-indexing-deep dark:text-status-indexing",
  },
} as const;

export interface CalloutProps {
  tone?: keyof typeof TONE;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** An inline aside that doesn't compete with a full `Surface` card —
 * used to flag a caveat or a tip inline within prose (Docs) without
 * breaking the reading column. */
export function Callout({ tone = "info", title, children, className = "" }: CalloutProps) {
  const { icon: Icon, className: toneClassName, iconClassName } = TONE[tone];
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3.5 text-sm leading-relaxed ${toneClassName} ${className}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${iconClassName}`} />
      <div className="flex flex-col gap-0.5">
        {title && <p className="font-medium text-ink-950 dark:text-ink-50">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
