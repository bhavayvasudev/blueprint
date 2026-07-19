import type { DocAudit } from "@blueprint/shared-types";
import { Surface } from "@blueprint/ui";
import { IconWarning } from "@/components/workspace/icons";

// Maps a real, literal audit-check label (`pipeline/ingestion/doc_audit.py`)
// to constructive copy — the check itself is real; only the phrasing
// changes, never the underlying claim.
const SUGGESTION_COPY: Record<string, string> = {
  README: "Add a README",
  License: "Add a LICENSE",
  "Contributing guide": "Add CONTRIBUTING.md",
  "Security policy": "Add SECURITY.md",
  "Issue templates": "Add issue templates",
  "CI/CD pipeline": "Add a CI/CD pipeline",
  "Environment template": "Add a .env example",
  "Docker support": "Add Docker support",
  Tests: "Add tests",
};

/** "Suggested Improvements" — a real filesystem-presence audit
 * (`pipeline/ingestion/doc_audit.py`), framed as constructive next steps
 * rather than a list of what's wrong. Every row is a literal file/path
 * check against this exact repository, so a suggestion always names
 * something genuinely absent, never a boilerplate nag. */
export function ProjectHygieneCard({ audit }: { audit: DocAudit | null }) {
  if (!audit) {
    return (
      <Surface padding="md" className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink-950 dark:text-ink-50">Suggested Improvements</h3>
        <p className="text-sm text-ink-500 dark:text-ink-400">Not audited by this study.</p>
      </Surface>
    );
  }

  if (audit.missing.length === 0) {
    return (
      <Surface padding="md" className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink-950 dark:text-ink-50">Suggested Improvements</h3>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Nothing on this checklist is missing — project hygiene is in good shape.
        </p>
      </Surface>
    );
  }

  return (
    <Surface padding="md" className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink-950 dark:text-ink-50">Suggested Improvements</h3>
      <ul className="flex flex-col gap-2">
        {audit.missing.map((label) => (
          <li key={label} className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-300">
            <IconWarning className="mt-0.5 size-4 shrink-0 text-status-failed-deep dark:text-status-failed" />
            {SUGGESTION_COPY[label] ?? `Add ${label}`}
          </li>
        ))}
      </ul>
    </Surface>
  );
}
