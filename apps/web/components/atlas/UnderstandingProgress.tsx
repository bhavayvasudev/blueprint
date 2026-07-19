import { Surface } from "@blueprint/ui";
import { IconCheck } from "@/components/workspace/icons";

/** "Understanding Progress" — a study checklist, not a health bar. Every
 * item traces to one real field the pipeline actually populated (see the
 * callers below); there is no percentage or weighted score here on
 * purpose — a checkmark reads instantly, a number invites second-guessing
 * a precision this study never claimed. */
export function UnderstandingProgress({ items }: { items: { label: string; done: boolean }[] }) {
  return (
    <Surface padding="md" className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-ink-950 dark:text-ink-50">Understanding Progress</h3>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 text-sm">
            <span
              aria-hidden
              className={`flex size-4 shrink-0 items-center justify-center rounded-full ${
                item.done
                  ? "bg-status-ready/15 text-status-ready-deep dark:text-status-ready"
                  : "bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500"
              }`}
            >
              {item.done ? <IconCheck className="size-2.5" /> : null}
            </span>
            <span
              className={
                item.done ? "text-ink-700 dark:text-ink-300" : "text-ink-400 dark:text-ink-500"
              }
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </Surface>
  );
}
