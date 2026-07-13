# Blueprint — Implementation Phases

Status: sequencing plan. Phases follow the Repository Intelligence Pipeline stage order defined in `ARCHITECTURE.md` §3, not an arbitrary sprint breakdown — each phase adds exactly one pipeline stage (or a tightly coupled pair) and ships a real, usable increment of the product, never an internal-only refactor with nothing to show.

Time estimates assume solo/part-time effort, consistent with the project's actual staffing. Complexity ratings: S / M / L / XL.

---

## Phase 0 — Foundation & Deterministic Ingestion

**Goal:** stand up the skeleton and Pipeline Stages 1–4 (`ARCHITECTURE.md` §3.1–3.4) — everything deterministic, nothing LLM-driven yet.

**Deliverables:** repo scaffolding per `ARCHITECTURE.md` §18; GitHub App auth + repo connect flow; Postgres schema for `users`, `repositories`, `repo_snapshots`, `files`, `code_chunks`, `doc_chunks`, `graph_nodes`, `graph_edges`; Tree-sitter extraction for Python/TypeScript/Go; Knowledge Graph and Repository Graph construction; embedding generation + hybrid retrieval interface; worker/queue setup (RQ + Redis).

**Acceptance criteria:** connecting a real repository (test against ClaimSight India) produces a populated Repository Graph, visible in a bare-bones Architecture View, with zero LLM calls involved — every fact traceable to a specific file/symbol.

**Dependencies:** none — this is the base of the dependency chain every later phase sits on.

**Risks:** underestimating Tree-sitter grammar edge cases; mitigated by the `structural_confidence` fallback tagging already specified in `ARCHITECTURE.md` §4, built here rather than retrofitted.

**Suggested GitHub milestone:** `v0.1 — Deterministic Foundation`.

**Suggested PR breakdown:** (1) repo scaffolding + CI, (2) DB schema + migrations, (3) GitHub App auth + connect flow, (4) Tree-sitter extraction, (5) Knowledge Graph construction, (6) Repository Graph rollup, (7) embeddings + hybrid retrieval, (8) bare Architecture View (frontend).

**Suggested commit groups:** `chore(scaffold)`, `feat(auth)`, `feat(pipeline/ingestion)`, `feat(pipeline/graph)`, `feat(web/architecture-view)`.

**Expected output:** a working, deployed skeleton that can ingest a repo and show its real structure — no reasoning yet, but a genuine, demoable "it understands the shape of my code" milestone.

**Complexity:** L. **Time estimate:** 2–3 weeks.

---

## Phase 1 — Architecture Understanding

**Goal:** ship Stage 5 (`ARCHITECTURE.md` §3.5) — the first LLM agent, and the first Finding-producing stage.

**Deliverables:** `findings` table + `finding_relations` table (schema per `ARCHITECTURE.md` §11); the Finding evidence-check/confidence-compute/persist pipeline (`ARCHITECTURE.md` §2) built generically here since every later agent reuses it; the Architecture Agent itself; `FindingCard` component (`RULES.md` §5) built here as the first and reused-everywhere UI primitive.

**Acceptance criteria:** the Architecture View shows a narrative architecture summary with every claim citing real config/folder evidence, and the underlying Finding lifecycle (evidence-check, confidence-compute, persist) is generic enough that Phase 2's agent needs zero lifecycle-plumbing changes to plug in.

**Dependencies:** Phase 0.

**Risks:** building the Finding lifecycle machinery too narrowly around this one agent's shape; mitigate by writing Phase 2's agent interface stub before finalizing Phase 1's lifecycle code, even though Phase 2 isn't implemented yet.

**Suggested GitHub milestone:** `v0.2 — First Reasoning`.

**Suggested PR breakdown:** (1) `findings`/`finding_relations` schema, (2) generic Finding lifecycle (evidence-check, confidence-compute, persist), (3) Architecture Agent, (4) `FindingCard` component, (5) Architecture View narrative section.

**Expected output:** the first real "Blueprint reasoned about my repo" demo moment, even though it's the least differentiated stage — proves the Finding machinery end to end before the harder stages build on it.

**Complexity:** M. **Time estimate:** 1 week.

---

## Phase 2 — Feature Extraction & Doc-vs-Code Cross-Validation

**Goal:** ship Stage 6 (`ARCHITECTURE.md` §3.6) — the highest-value and highest-risk stage in the entire pipeline, and the one this whole project's credibility rests on.

**Deliverables:** the two-pass claimed-vs-actual extraction; the `search_repository` tool and its logged-call requirement for every absence claim (`ARCHITECTURE.md` §3.6, `RULES.md` §12); the four-category classification (verified / doc-ahead-of-code / code-ahead-of-docs / ambiguous); **the eval harness v0** (`ARCHITECTURE.md` §16) — a hand-labeled golden set of 5–10 repos including ClaimSight India and HyperOne, with manually verified feature lists, built alongside this phase rather than after, since this is precisely the stage that must not ship unvalidated.

**Acceptance criteria:** running Blueprint against ClaimSight India correctly surfaces at least one real, previously-known doc-vs-code gap with evidence and reasoning matching the worked example in `PRD.md` §7 / Design Proposal v2 §4, and the eval harness reports precision/recall against the golden set — not just "it produced plausible-looking output."

**Dependencies:** Phase 1 (Architecture Agent output is required context per `ARCHITECTURE.md` §3.6).

**Risks:** this is the phase most likely to run long — budget for it explicitly rather than compressing it to protect the overall schedule; a wrong "missing feature" claim here is the single most damaging failure mode in the whole product (`PRD.md` §12), and no other phase deserves as much scrutiny before merge.

**Suggested GitHub milestone:** `v0.3 — Repository Understanding`.

**Suggested PR breakdown:** (1) `search_repository` tool + logging, (2) claimed-capabilities extraction pass, (3) actual-capabilities extraction pass, (4) diff/classification logic, (5) golden-set labeling (data, not code — tracked as its own PR against `apps/api/eval/golden/`), (6) eval harness runner + report, (7) Feature Extraction section of the Repository Intelligence View.

**Expected output:** the flagship capability — this phase alone, done well, is the demo that proves the product's core thesis.

**Complexity:** XL. **Time estimate:** 2–3 weeks.

---

## Phase 3 — Dependency & Debt Intelligence

**Goal:** ship Stages 7 and 8 (`ARCHITECTURE.md` §3.7–3.8), run in parallel since neither depends on the other, both depending only on Phase 2's output.

**Deliverables:** the Dependency Agent producing Depends On / Blocked By / Blocks relations as `finding_relations` rows; deterministic Blocks-graph traversal (blast radius, no LLM call, per `ARCHITECTURE.md` §3.7); the Debt Agent producing `debt` Findings; the Dependency View (distinct from the Architecture View — `RULES.md` §4) with blast-radius rendering (dashed/ghosted downstream nodes per Design Proposal v2 §6); a debt ledger section in the Repository Intelligence View.

**Acceptance criteria:** a missing feature identified in Phase 2 correctly lights up every downstream feature that depends on it, with the "Policy Reader → Coverage Validation → Claim Recommendation → Final Report" example (or its real ClaimSight equivalent) rendering correctly end to end.

**Dependencies:** Phase 2.

**Risks:** conflating structural and conceptual dependency (`ARCHITECTURE.md` §6) — code review for this phase should specifically check that no Dependency Finding was derived from Knowledge/Repository Graph edges alone without going through actual feature-level reasoning.

**Suggested GitHub milestone:** `v0.4 — Dependency Intelligence`.

**Suggested PR breakdown:** (1) Dependency Agent, (2) Blocks-graph deterministic traversal, (3) Dependency View (frontend), (4) Debt Agent, (5) debt ledger section.

**Expected output:** the signature visual feature of the product — the dependency graph with blast radius — working against a real repo.

**Complexity:** L. **Time estimate:** 1.5–2 weeks.

---

## Phase 4 — Repository Reasoning & Consistency Check

**Goal:** ship Stage 9 (`ARCHITECTURE.md` §3.9) — the synthesis layer that produces the Staff-Engineer-register narrative Findings, and the cross-Finding consistency check.

**Deliverables:** the Repository Reasoning Agent, consuming Stage 6/7/8 Findings as structured objects only (never raw code, never prose — enforced at the interface level, not just by convention); the consistency-check contract (`no_contradiction` / `contradiction_resolved_by_rerun` / `contradiction_downgraded_to_ambiguous`) and its logging; narrative Finding rendering in the Repository Intelligence View.

**Acceptance criteria:** the worked example from `PRD.md` §7 renders end to end, in the product, against a real repository, in the same register and evidence structure as the original example — this is the phase where the product's actual voice comes alive, and it should be reviewed against that bar directly, not just against a generic "does it produce text" check.

**Dependencies:** Phase 3.

**Risks:** an agent that quietly reaches past its Stage 6/7/8 structured inputs back to raw retrieval "to make the prose better" — this is exactly the layering violation `RULES.md` §9 exists to prevent, and it's tempting precisely because it would make the prose read better in the short term at the cost of the evidence guarantee.

**Suggested GitHub milestone:** `v0.5 — Repository Reasoning`.

**Suggested PR breakdown:** (1) Repository Reasoning Agent, (2) consistency-check logic + `contradicts[]` population, (3) narrative section in the Repository Intelligence View.

**Expected output:** the moment the product stops looking like a collection of graphs and starts reading like a document a Staff Engineer wrote.

**Complexity:** L. **Time estimate:** 1.5–2 weeks.

---

## Phase 5 — Explainable Metrics

**Goal:** ship Repository Maturity and Understanding Confidence as serving-layer aggregates (`ARCHITECTURE.md` §7.1–7.4, §11) — deliberately placed after Phase 4 rather than earlier, since a defensible Maturity score requires Feature, Debt, and Reasoning Findings to already exist.

**Deliverables:** `maturity_scores` and `understanding_confidence` as two separate tables and two separate API responses (`ARCHITECTURE.md` §11–12) — never merged, per ADR-011; the composite-breakdown UI (`RULES.md` §11) on every card and score shown; the dashboard card grid, now showing an honest, explained badge instead of a placeholder.

**Acceptance criteria:** every displayed score expands, on click, into its exact computation inputs, and Understanding Confidence never contributes to the Maturity number — a direct regression test against ADR-011's failure mode belongs in this phase's test suite.

**Dependencies:** Phase 4.

**Suggested GitHub milestone:** `v0.6 — Explainable Metrics`.

**Suggested PR breakdown:** (1) `maturity_scores` + `understanding_confidence` computation, (2) score breakdown UI, (3) dashboard card grid.

**Expected output:** the portfolio dashboard becomes real and honest — the first end-to-end multi-repo view.

**Complexity:** M. **Time estimate:** 3–5 days.

---

## Phase 6 — Roadmap Generation

**Goal:** ship Stage 10 (`ARCHITECTURE.md` §3.10).

**Deliverables:** the Roadmap Agent, consuming Stage 9 Findings only; dependency-ordered, blast-radius-aware sequencing with complexity/time estimates; the roadmap section/view.

**Acceptance criteria:** the generated roadmap for ClaimSight India, reviewed by you personally against what you actually know needs to happen next, would not require reordering to be something you'd act on.

**Dependencies:** Phase 5 (not strictly a data dependency, but sequenced after Explainable Metrics so the roadmap can reference Maturity trend data if useful — a soft dependency worth keeping in order rather than parallelizing for the sake of it).

**Suggested GitHub milestone:** `v0.7 — Roadmap`.

**Suggested PR breakdown:** (1) Roadmap Agent, (2) roadmap section (frontend), (3) `/repos/{id}/timeline` endpoint for cross-snapshot roadmap history.

**Expected output:** the third of four MVP superpowers, complete.

**Complexity:** M. **Time estimate:** 1 week.

---

## Phase 7 — Claude Prompt Generation — MVP COMPLETE

**Goal:** ship Stage 11 (`ARCHITECTURE.md` §3.11, §8) — the smallest remaining engineering lift of the four superpowers despite being the most externally visible, per `PRD.md` §15.

**Deliverables:** the on-demand Prompt Generation Agent; targeted retrieval for execution detail (conventions, reusable middleware, files to avoid); the Blocked-By-edge annotation check (`ARCHITECTURE.md` §8); the two-pane Prompt Generator UI with context disclosure; `prompt_generations` logging.

**Acceptance criteria:** a generated prompt for a real ClaimSight India roadmap item is something you would copy into Claude Code without manual editing — the actual success metric from `PRD.md` §11.

**Dependencies:** Phase 6.

**Suggested GitHub milestone:** `v1.0 — MVP`.

**Suggested PR breakdown:** (1) Prompt Generation Agent + targeted retrieval, (2) Blocked-By annotation, (3) Prompt Generator UI, (4) prompt history view.

**Expected output:** MVP complete — all four superpowers from `PRD.md` §15 shipped, in dependency order, each independently demoable along the way.

**Complexity:** M. **Time estimate:** 1 week.

---

## Phase 8 (v1.1) — Caching, Incremental Indexing, Webhook Sync

**Goal:** the content-hash-keyed caching design already specified in `ARCHITECTURE.md` §9 gets wired up for real; manual sync is replaced by webhook-driven sync.

**Deliverables:** per-stage cache-key computation and reuse; GitHub webhook receiver + signature verification (`ARCHITECTURE.md` §14); incremental recomputation scoped to the actual invalidation cone, reusing the Blocks-graph traversal from Phase 3 (`ARCHITECTURE.md` §9's explicit reuse point).

**Acceptance criteria:** a one-file change to a previously-indexed repository re-syncs in under a minute and produces identical Findings for everything untouched by the change.

**Dependencies:** Phase 7 (all pipeline stages must exist before their caching behavior can be implemented and tested).

**Suggested GitHub milestone:** `v1.1 — Incremental`.

**Expected output:** the product becomes cheap and fast enough to run continuously rather than on-demand, which is the precondition for every v2 feature in `PRD.md` §16.

**Complexity:** L. **Time estimate:** 1.5–2 weeks.

---

## Beyond Phase 8

Everything in `PRD.md` §16 (v1.2+/v2) — PR-level analysis, multi-repo portfolio views, team accounts, public API, CLI, plugin system, GraphRAG — is intentionally left unphased here. Phasing it now, before the MVP has been used against real repositories and the eval harness has produced real calibration data, would be planning against assumptions instead of evidence — the exact failure mode this whole product exists to help other people avoid in their own projects.
