import type { DocAudit } from "@blueprint/shared-types";
import { Surface } from "@blueprint/ui";
import { IconCheck, IconWarning } from "@/components/workspace/icons";

/** The audit's internal labels, shortened for the Briefing.
 *
 * The check itself is unchanged — only the wording is. `doc_audit.py`'s
 * labels are written to be unambiguous in a data column; these are written
 * to be scannable in a list of six. Anything unmapped falls through to its
 * own label, so adding a check on the backend never silently disappears. */
const SHORT_LABEL: Record<string, string> = {
  "CI/CD pipeline": "CI",
  "Docker support": "Docker",
  "Environment template": "Env template",
  "Contributing guide": "Contributing",
  "Security policy": "Security policy",
  "Issue templates": "Issue templates",
  Documentation: "Docs",
};

/** "What's Present" / "What's Missing" — the same real audit
 * (`pipeline/ingestion/doc_audit.py`) read from both sides.
 *
 * Each entry is a literal file-existence check, a filename-pattern match
 * against discovered files (Tests), or a real route-match count (API). A
 * label appears in exactly one of the two lists and never both, which is
 * what keeps this from being the duplicated information the Briefing was
 * carrying before. */
export function PresenceCard({
  audit,
  variant,
}: {
  audit: DocAudit | null;
  variant: "present" | "missing";
}) {
  const isPresent = variant === "present";
  const title = isPresent ? "What’s present" : "What’s missing";

  if (!audit) {
    return (
      <Surface padding="md" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink-950 dark:text-ink-50">{title}</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          This study ran before the hygiene audit existed, so there’s nothing to report. A fresh
          sync will fill it in.
        </p>
      </Surface>
    );
  }

  const items = isPresent ? audit.present : audit.missing;

  return (
    <Surface padding="md" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-ink-950 dark:text-ink-50">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-ink-500 dark:text-ink-400">
          {isPresent
            ? "Nothing on the checklist was found in this repository."
            : "Nothing is missing — every check on the list passed."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((label) => (
            <li
              key={label}
              className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-300"
            >
              {isPresent ? (
                <IconCheck className="mt-0.5 size-4 shrink-0 text-status-ready-deep dark:text-status-ready" />
              ) : (
                <IconWarning className="mt-0.5 size-4 shrink-0 text-status-failed-deep dark:text-status-failed" />
              )}
              {SHORT_LABEL[label] ?? label}
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
