# Blueprint — Rules

Status: binding conventions. This document defines *how* Blueprint is built, day to day. `PRD.md` defines what and why; `ARCHITECTURE.md` defines the system; this document defines the discipline that keeps both intact as the codebase grows over months of work by humans and AI agents together.

If a rule here ever blocks a genuinely better outcome, the right move is to propose an ADR in `DECISIONS.md` that supersedes it — not to quietly ignore it.

---

## 1. Project Philosophy

Blueprint is a reasoning product before it is a software product. Every engineering decision should be judged first by "does this make Blueprint's judgments more correct or more trustworthy," and only second by "is this a nice piece of software." A beautifully engineered feature that adds no reasoning value is scope creep, not craftsmanship.

Deterministic before probabilistic. If a fact can be extracted with a parser, a manifest read, or a graph traversal, it must be — an LLM call is never the first tool reached for. AI is used only where genuine judgment is required (interpreting intent, synthesizing narrative, weighing tradeoffs), never where a script would do.

Simplicity now, correctness always. Build the simplest architecture that can scale to the next stated milestone in `PHASES.md` — not the architecture that could theoretically handle ten future scenarios that aren't yet real requirements. Correctness of Findings is never negotiable in that tradeoff; simplicity is only ever traded against speculative scale, never against reasoning quality.

## 2. Coding Conventions

Python (backend/pipeline): type-annotated throughout, Pydantic models at every boundary (agent I/O, API request/response, database read/write) — untyped `dict` passing between pipeline stages is not permitted, since the whole evidence-propagation guarantee in `ARCHITECTURE.md` §2 depends on structured, validated Finding objects, not loosely-shaped data. TypeScript (frontend): strict mode on, no `any` without an inline comment explaining why it's unavoidable.

Functions and modules should be named for what they produce, not what they do internally — `extract_features()` not `run_llm_call_for_features()`. Every pipeline agent module exposes one public entrypoint function with a fully typed signature; internal prompt construction, retrieval calls, and parsing are private to that module.

## 3. Folder Conventions

Follow `ARCHITECTURE.md` §18 exactly. New code belongs in the existing structure; a genuinely new top-level directory requires an ADR, not a judgment call made inside a PR.

## 4. Naming Conventions

**Terminology is fixed and must be used consistently across code, UI copy, and docs — this list exists because Design Proposal v2 already drifted on some of these terms once (see `DECISIONS.md` ADR-011, ADR-012):**

"Finding" — never "insight," "result," "output," or "recommendation" in new code or copy. "Knowledge Graph" — symbol-level only, never used for the module-level graph. "Repository Graph" — module/service-level; rendered in the UI as the **Architecture View**. "Feature Dependency Graph" — the Stage 7 conceptual graph; rendered in the UI as the **Dependency View**. These two views are never visually merged or given interchangeable names in UI copy. "Repository Maturity" — the three-component composite (Feature Coverage, Documentation Coverage, Technical Debt) only. "Understanding Confidence" — the separate epistemic-reliability badge; never called "Architecture Confidence" in user-facing copy going forward (renamed for clarity — see ADR-011) and never a component of Maturity. "Debt Agent" — not "Debt & Health Agent"; Health/Maturity is a serving-layer aggregate, not this agent's output.

## 5. Component Conventions (Frontend)

One Finding renders through one component: `FindingCard`, parameterized by `type`, never re-implemented per surface. A new Finding type requires extending `FindingCard`'s rendering logic, not creating `DebtCard`, `RoadmapCard`, etc. Components are colocated with the route that primarily uses them unless shared across 2+ routes, in which case they move to `packages/ui`. No component may call `fetch`/API clients directly except at the route/page level — data flows down as props, which keeps every visual component testable in isolation.

## 6. Backend Conventions

Route handlers (`api/`) are thin: validate input, call a service, return a typed response — no business logic in a route handler. Business logic lives in `services/`. Pipeline logic lives in `pipeline/` and must remain importable and runnable without FastAPI running (`ARCHITECTURE.md` §13) — a pipeline module importing anything from `api/` is a layering violation.

Every external call (GitHub API, LLM provider, embedding provider) goes through `integrations/`, wrapped, never called directly from `services/` or `pipeline/` — this is what makes the eval harness and retry logic implementable in one place instead of scattered.

## 7. Frontend Conventions

Server Components by default; a component becomes a Client Component only when it needs interactivity Server Components can't provide (graph pan/zoom, streaming prompt output) — see `ARCHITECTURE.md` §15. No global state store; server state via React Query, local UI state in component state, per the same section.

## 8. Database Conventions

Every table that stores reasoning output carries `snapshot_id` and is immutable once written (`ARCHITECTURE.md` §2, §11) — no `UPDATE` statements against `findings` rows; corrections are new rows with a `supersedes` pointer. Migrations are additive-first; a destructive migration (column drop, type narrowing) requires an ADR explaining why the old shape is no longer needed, not just a passing PR review.

## 9. Repository Intelligence Conventions

No pipeline stage may skip the layering defined in `ARCHITECTURE.md` §3 — Stage 10 (Roadmap) consumes Stage 9 output only, never reaches back to Stage 6/7/8 directly, even if it would be convenient. This rule exists specifically because skipping a layer is how the roadmap and the rest of the UI silently drift out of sync with each other.

Every new pipeline capability is evaluated against one question before it's built: does this improve the correctness or trustworthiness of a Finding, or does it just add a new thing to look at? If the honest answer is the latter, it doesn't belong in the pipeline — see §16, Things Never To Do.

## 10. Finding Conventions

A Finding is never constructed with an empty `evidence[]` array — this should be enforced at the Pydantic model level (a validator that rejects the object), not just a code-review convention. A Finding's `confidence` field is never set directly by an agent — it is always computed by the confidence pipeline (§11) from the agent's proposed band plus the deterministic factors, and that computation is a single shared function, not reimplemented per agent. Every Finding that supersedes another must set `supersedes`; a "new" Finding on a re-sync that actually just restates a prior one unchanged should reuse evidence but still be a new row scoped to the new snapshot (§`ARCHITECTURE.md` §2) — snapshots are never partially populated from a prior snapshot's rows.

## 11. Confidence Conventions

Confidence is a computed integer 0–100, never an LLM's raw self-reported number (`ARCHITECTURE.md` §2, step 3; Design Proposal v2 §7). The computation combines: evidence-count factor (independent corroborating sources > a single source), retrieval-quality factor (high-similarity unambiguous hits > low-similarity best-effort matches), and cross-agent-agreement factor (did Stage 9's conclusion match the upstream Finding it's built from). The LLM's own proposed band (high/medium/low) is one input to this computation, never the output.

Absence claims specifically (`feature_status = doc-ahead-of-code` or any Finding asserting something doesn't exist) are subject to an additional ceiling: confidence may not exceed a fixed cap (initial placeholder 75%, to be set from real eval-harness results per `ARCHITECTURE.md` §16 and `DECISIONS.md` ADR-009 — not left at a guessed number past the first eval run) unless two independently-phrased retrieval strategies agree. Disagreement caps the Finding at `ambiguous` regardless of what either individual pass reported.

A confidence score is never displayed without its composition being one click away — no exceptions, this is a `PRD.md` §8 UX principle enforced here as an engineering requirement.

## 12. Evidence Conventions

Every evidence entry cites a concrete, resolvable pointer: a file path plus line range, a symbol name, a commit SHA, or an issue/PR number — never a paraphrase with no pointer. Every citation is programmatically verified to resolve against the actual repository content before the Finding is persisted (`ARCHITECTURE.md` §2, step 2); an unresolvable citation is a hard rejection, not a warning. Negative evidence (a claim of absence) must include the logged tool call and its raw result — query string and hit count — not just the agent's conclusion that nothing was found.

## 13. Prompt Engineering Conventions

Every agent prompt lives in source control as a versioned template, not inline string interpolation scattered through business logic — `pipeline/agents/<stage>/prompts.py` per agent. Agent prompts that make claims about the repository must be instructed to cite evidence inline, not append citations after the fact — asking for evidence after generation measurably increases post-hoc rationalization risk versus asking for it as part of the generation. Every prompt template includes an explicit instruction to use the `search_repository` tool for any absence claim (§12) rather than relying on retrieved context alone — this is stated in the prompt itself, not assumed as implicit behavior. Prompt changes that could affect Finding quality require an eval-harness run before merge, not after (`ARCHITECTURE.md` §16) — a prompt change is a reasoning-quality change, held to the same bar as a code change to the confidence computation.

## 14. API Conventions

REST, versioned (`/api/v1`), per `ARCHITECTURE.md` §12. Every list endpoint over Findings supports `type` filtering server-side — the frontend never fetches all Findings and filters client-side. Endpoints that trigger agent work (`/sync`, `/generate-prompt`) return a job/request ID immediately and are polled or streamed, never held open synchronously for the full pipeline duration — the one exception, Stage 11, is scoped tightly enough (§`ARCHITECTURE.md` §13) that a synchronous response is acceptable within the 15-second budget in `PRD.md` §10.

## 15. Testing Philosophy

Deterministic stages (1–4) get standard unit and integration tests against fixture repositories — normal software testing, no exceptions. LLM-driven stages (5–11) are primarily validated through the golden-set eval harness (`ARCHITECTURE.md` §16), not unit tests asserting exact output strings, which is a losing battle against a nondeterministic component. What *is* unit-tested for agent stages: the surrounding scaffolding — evidence-citation resolution, confidence computation, the consistency-check contract (§`ARCHITECTURE.md` §7), retry/rejection logic — everything deterministic wrapped around the nondeterministic core. The eval harness itself is treated as a first-class, scheduled test suite, not a manual pre-demo script.

## 16. Accessibility Rules

All interactive graph views (Architecture View, Dependency View) must have a non-visual equivalent — a list/table fallback conveying the same nodes, edges, and blast-radius information — since a force-directed graph is not screen-reader-navigable by nature. Color is never the sole signal for Finding confidence or debt severity; pair with icon/label. Motion (§18) respects `prefers-reduced-motion`.

## 17. Animation Philosophy

Motion clarifies state change; it never decorates. A Finding resolving from `ambiguous` to `verified` on re-sync animates because that's a real state transition worth noticing; a card hover lifting 2–4px on a static list is the ceiling of decorative motion permitted — nothing bouncier, nothing that runs on page load purely for spectacle (`PRD.md` §8, Design Proposal v2 §16). Graph edges draw in sequentially on first render (communicates "this was constructed," which is true), not all at once.

## 18. Typography & UI Consistency

One type scale, one accent color, an 8px spacing grid, defined once in `packages/ui` and never overridden ad hoc per page (`ARCHITECTURE.md` §18). The Repository Intelligence View is a document, not a dashboard (`PRD.md` §8) — this has a concrete UI consequence: no tab bars for its primary navigation, a single continuous scroll with inline diagrams, per Design Proposal v2 §11. Every new screen is checked against the reference points (Linear, Raycast, Arc, Stripe, Vercel) before merge — if it reads as "another AI SaaS dashboard," it's wrong regardless of how functional it is.

## 19. Git Workflow

Trunk-based with short-lived feature branches. No direct commits to `main`. Every PR maps to a deliverable in `PHASES.md` — if a PR doesn't map to a phase deliverable, either the PR is out of scope right now or `PHASES.md` is missing something and needs updating first, not silently worked around.

**Branch naming:** `phase-<n>/<short-description>`, e.g. `phase-2/dependency-agent-blocked-by-edges`.

**Commit style:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`), scoped to the affected area where useful (`feat(pipeline): add evidence resolution retry`). A commit that changes reasoning behavior (a prompt, a confidence weight, an agent's evidence requirements) must reference the eval-harness run that validated it in the commit body, per §13.

## 20. Documentation Standards

Every architectural change is recorded in `DECISIONS.md` before or alongside the PR that implements it — never after, and never silently. Every completed phase milestone updates `MEMORY.md` (once implementation begins — see `MEMORY.md`'s own header). Every feature PR description states which `PRD.md` requirement it maps to. Documentation drift between this file set and the actual codebase is treated as a bug, filed and fixed like any other — fittingly, exactly the kind of drift Blueprint itself is built to detect, which makes it a genuine embarrassment to tolerate here.

## 21. Performance Guidelines

Targets are stated in `PRD.md` §10 (5-minute full index, <1-minute incremental once shipped, <15-second prompt generation) — treat these as budgets to test against, not aspirations. Any new pipeline stage or agent call is checked against its latency contribution before merge; a stage that silently doubles total pipeline time needs an explicit justification in its PR, not a shrug.

## 22. Security Rules

Per `ARCHITECTURE.md` §17: row-level security for all tenant data, no secrets in source or client bundles, GitHub App tokens only (never PATs), signed webhook verification, rate limiting on `/sync` and `/generate-prompt`. No repository content is sent to any external service beyond what's explicitly documented in the security posture; adding a new third-party call that touches repository content requires updating that documented posture in the same PR, not after the fact.

## 23. Things Never To Do

Never let an agent assert absence from memory without a logged tool call (§12). Never display a confidence number without its composition available (§11). Never skip pipeline layering — an agent reaching past its defined inputs to grab raw data "just this once" (§9). Never mutate a persisted Finding in place (§10). Never build a feature whose primary value is a chart, table, or metric GitHub already provides natively (`PRD.md` §17) — this is the single most likely form of scope creep for this specific project and should be the first question asked of any new feature proposal: "does GitHub already show this adequately?" Never add a UI element that reads as generic-AI-dashboard chrome (tab bars as primary nav, gamified progress bars, unexplained percentages) — check against §18 before merge. Never let documentation drift from the implemented system without filing it (§20).

## 24. Architecture Principles

Deterministic-first layering is structural, not a suggestion — `ARCHITECTURE.md` §3's stage table is the actual contract new code must respect. One Finding schema, one card component, one confidence computation, one evidence-resolution path — consolidation over per-feature reinvention, every time the choice arises. Build the simplest thing that satisfies the current `PHASES.md` milestone; defer the rest explicitly to `PRD.md` §16 rather than half-building it now.

## 25. AI Reasoning Principles

Evidence before assertion, always. Confidence is computed, never claimed. Uncertainty is a UI state (`ambiguous`), never silently resolved in either direction. Every reasoning stage consumes structured upstream output, never another agent's prose, preserving the provenance chain end to end. AI is used only where deterministic extraction genuinely cannot do the job — and that judgment is revisited, not assumed permanent, as the deterministic layers (Tree-sitter coverage, graph heuristics) improve over time and can legitimately take over work an LLM agent currently does.
