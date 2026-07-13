import { PlaceholderPanel } from "@blueprint/ui";

/** Reserved layout slots for Repository Intelligence (PHASES.md Phases
 * 1-7) — this is the point of PR8's brief: the layout below is designed
 * so Findings/Roadmap/Dependency Graph/Prompt Generation slot in here
 * without a redesign, not so they can be faked now. */
export function IntelligencePlaceholders() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <PlaceholderPanel
        title="Architecture Narrative"
        phase="Phase 1"
        description="A narrative summary of this repository's structure, with every claim citing real config/folder evidence."
      />
      <PlaceholderPanel
        title="Feature Findings"
        phase="Phase 2"
        description="Doc-vs-code cross-validation: verified, doc-ahead-of-code, code-ahead-of-docs, or ambiguous, each with cited evidence."
      />
      <PlaceholderPanel
        title="Dependency & Debt"
        phase="Phase 3"
        description="Feature-level Depends On / Blocked By / Blocks relations, blast-radius traversal, and a technical debt ledger."
      />
      <PlaceholderPanel
        title="Roadmap & Prompt Generation"
        phase="Phases 6-7"
        description="Dependency-ordered next steps, and context-loaded Claude Code prompts generated from a selected Finding."
      />
    </div>
  );
}
