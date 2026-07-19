"use client";

import { useStatsForNerds } from "@/lib/use-stats-for-nerds";

/** A real toggle switch (`role="switch"`), not a checkbox styled to look
 * like one — matches the accessible-control contract every other input
 * in the workspace follows. */
export function StatsForNerdsToggle() {
  const [enabled, setEnabled] = useStatsForNerds();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => setEnabled(!enabled)}
      className="group flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 text-sm text-ink-500 transition-colors hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200"
    >
      <span
        aria-hidden
        className={`relative flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
          enabled ? "bg-accent-500" : "bg-ink-200 dark:bg-ink-700"
        }`}
      >
        <span
          className={`absolute size-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? "translate-x-[18px]" : "translate-x-1"
          }`}
        />
      </span>
      <span className="font-medium">Stats for nerds</span>
    </button>
  );
}
