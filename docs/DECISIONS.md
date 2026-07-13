# Blueprint — Architecture Decision Records

Status: living log. Every ADR below is referenced by number from `ARCHITECTURE.md` and `RULES.md` — do not renumber existing entries; append new ones. ADR-010, 011, and 012 were produced during the documentation pass itself, from re-reading Design Proposal v2 closely rather than adopting it verbatim — they are corrections, not stylistic notes, and are called out as such below rather than silently folded in.

Template: Decision / Reason / Alternatives Considered / Tradeoffs / Status / Future Reconsideration.

---

### ADR-001 — Tree-sitter for AST extraction

**Decision:** use Tree-sitter as the sole AST extraction engine for Pipeline Stage 1, with a heuristic regex-based fallback for unsupported languages.

**Reason:** fast, incremental-parse-friendly, broad and growing language grammar coverage, and widely used in production tooling (GitHub's own semantic code navigation, among others) — a proven choice rather than a novel one, which matters for a stage everything else depends on.

**Alternatives considered:** language-native AST tools per language (more accurate per-language, but N different integration surfaces and no unified incremental-parse story); LLM-based structural extraction (rejected outright — this is exactly the class of fact a deterministic parser should produce, per `RULES.md` §1's deterministic-first principle; using an LLM here would be paying inference cost and hallucination risk for something a parser does exactly and cheaply).

**Tradeoffs accepted:** grammar quality and completeness varies by language; mitigated by the `structural_confidence` fallback tagging (`ARCHITECTURE.md` §4), not by pretending the variance doesn't exist.

**Status:** Accepted.

**Future reconsideration:** if a target language's grammar proves too unreliable in practice (measured via a high `low_structural_confidence` rate on real repos), revisit with a language-specific extractor for that language only — not a wholesale replacement.

---

### ADR-002 — Knowledge Graph as a symbol-level property graph

**Decision:** represent the Knowledge Graph (Stage 2) as nodes (functions/classes/modules) and edges (imports/calls/references) derived directly and only from Stage 1 AST facts — no LLM involvement.

**Reason:** "what calls what" is a deterministic fact once the AST exists; computing it with an LLM would be strictly worse (slower, costlier, less exact) than a graph-construction pass over already-extracted structure.

**Alternatives considered:** skipping an explicit graph and querying AST facts directly per-request (rejected — repeated ad hoc traversal queries are both slower and harder to reason about than a precomputed graph; the Feature/Dependency agents need graph-neighbor expansion, per `ARCHITECTURE.md` §3.4, which requires the graph to exist upfront).

**Tradeoffs accepted:** an extra precomputation and storage cost per sync, accepted because it's paid once per changed file (via caching, `ARCHITECTURE.md` §9) rather than repeatedly per query.

**Status:** Accepted.

---

### ADR-003 — Defer a dedicated graph database

**Decision:** store both the Knowledge Graph and Repository Graph as adjacency tables (`graph_nodes`, `graph_edges`) in the primary Postgres instance, not in a dedicated graph database (Neo4j or similar).

**Reason:** at MVP and single-repo-at-a-time scale, adjacency-table queries in Postgres are entirely adequate, and introducing a second datastore adds real operational cost (a second thing to run, back up, and reason about failure modes for) with no measured benefit yet.

**Alternatives considered:** a dedicated graph database from day one (rejected as premature — no current query pattern has been shown to need graph-native traversal performance); a pure in-memory graph library with no persistence (rejected — Findings and graphs must survive process restarts and support historical snapshots per `ARCHITECTURE.md` §2).

**Tradeoffs accepted:** recursive traversal queries (multi-hop blast-radius computation) may degrade as graph size grows, particularly once multi-repo cross-linking (`PRD.md` §16, v2) is real.

**Status:** Accepted, explicitly conditional.

**Future reconsideration:** the specific, measured trigger to revisit is recursive traversal query latency exceeding an acceptable bound on real multi-repo data — not a scheduled revisit, not a hunch. Track this in the observability plan (`ARCHITECTURE.md` §16) once multi-repo linking exists.

---

### ADR-004 — Repository Graph is a distinct artifact, not a computed view

**Decision:** the Repository Graph (Stage 3, module/service-level) is constructed and persisted as its own graph, separate from the Knowledge Graph (Stage 2, symbol-level) — not derived on-the-fly by coarsening Stage 2 at query time.

**Reason:** the rollup from symbol-level to module-level is heuristic (folder conventions, config signals) and, per `ARCHITECTURE.md` §3.3, subject to override by the Architecture Agent when it has stronger evidence. An override needs something durable to override — a graph, not a query-time function — and persisting the result means Stage 5+ agents get a stable, citable Repository Graph rather than recomputing a possibly-inconsistent view each time they ask.

**Alternatives considered:** a single graph with a "resolution" or "level" attribute on each node (rejected — conflates two genuinely different edge semantics, "calls" vs "structurally depends on," under one edge type, which would have made the UI-conflation risk flagged in `RULES.md` §4 worse, not better).

**Tradeoffs accepted:** two graphs to construct and keep consistent instead of one; accepted because the product itself renders them as two distinct views (Architecture View vs. Dependency View) and conflating the underlying data model would make that separation harder to guarantee, not easier.

**Status:** Accepted.

---

### ADR-005 — Finding as the single unified reasoning schema

**Decision:** collapse what would otherwise be separate schemas for feature status, debt items, dependency edges, roadmap items, and generated prompts into one `findings` table plus a `finding_relations` join table, discriminated by a `type` column.

**Reason:** every one of these is structurally the same thing — a claim, evidence, reasoning, a confidence score, and an impact assessment — and modeling them separately (as Design Proposal v1 did) meant reinventing evidence/confidence/provenance handling five times, with five chances to drift out of sync. One schema means one evidence-resolution path, one confidence computation, one UI component (`FindingCard`, `RULES.md` §5), and one eval target (`ARCHITECTURE.md` §16).

**Alternatives considered:** per-type tables with a shared "evidence" interface enforced only by convention (rejected — "enforced by convention" is exactly the kind of guarantee that erodes under time pressure; a shared table with a Pydantic-validated schema enforces it structurally instead).

**Tradeoffs accepted:** less per-type column-level structure (type-specific shape lives in the `evidence`/`impact` `jsonb` fields rather than dedicated typed columns) — a deliberate trade of query convenience for schema consolidation, acceptable because Finding reads are almost always filtered by `type` and rendered through one component anyway, not queried by type-specific column predicates.

**Status:** Accepted.

---

### ADR-006 — PostgreSQL as the primary datastore

**Decision:** all persistent state — relational data, graphs (ADR-003), embeddings (ADR-007) — lives in a single PostgreSQL instance.

**Reason:** one datastore to operate, back up, and reason about consistency for for a project at this stage of maturity; Postgres with pgvector is proven at real scale (ADR-007) and adjacency tables are adequate for the graph workload (ADR-003) — nothing in the current requirements demands a polyglot-persistence architecture.

**Alternatives considered:** a document store for `findings`/evidence (rejected — Findings have real relational structure, most importantly the `finding_relations` provenance chain, which is exactly what a relational join is for).

**Tradeoffs accepted:** none material at current scale.

**Status:** Accepted.

---

### ADR-007 — pgvector for embeddings

**Decision:** store and query all embeddings (code chunks, doc chunks, issues) via the pgvector extension on the primary Postgres instance, not a dedicated vector database.

**Reason:** pgvector is proven well into millions of vectors, and keeping embeddings in the same datastore as the relational Finding/evidence data means a single query can join vector similarity with relational filters (e.g., "similar chunks, but only within this snapshot") without a cross-datastore round trip.

**Alternatives considered:** Pinecone/Weaviate/a dedicated vector DB (rejected for the same reason as ADR-003 — no current requirement justifies the added operational surface).

**Tradeoffs accepted:** none material at current scale; revisit only if vector query latency or index size becomes a measured problem, not preemptively.

**Status:** Accepted.

---

### ADR-008 — FastAPI for the backend

**Decision:** FastAPI serves the API layer; a separate worker process (same codebase) handles background pipeline execution.

**Reason:** native async support fits the I/O-bound nature of the serving layer (mostly reads against Postgres); Pydantic-first request/response modeling aligns directly with the Finding-schema discipline (`RULES.md` §2) — the same validation library used for Finding objects internally is used at the API boundary, one less concept to context-switch between.

**Alternatives considered:** Django (rejected — heavier than needed for an API-first backend with no admin-panel or template-rendering requirement); Node/Express (rejected — the pipeline itself is Python-native for Tree-sitter/LangGraph/ML-ecosystem integration, and splitting the API into a different language from the pipeline it serves adds a real integration seam for no offsetting benefit).

**Tradeoffs accepted:** none material.

**Status:** Accepted.

---

### ADR-009 — Absence-claim confidence ceiling is set empirically, not fixed in advance

**Decision:** the confidence ceiling for `doc-ahead-of-code` / absence-type Findings (`RULES.md` §11) ships with a placeholder value (75%) but is explicitly not treated as final; it is recalibrated from the first real eval-harness runs against the golden set (`ARCHITECTURE.md` §16, Phase 2 in `PHASES.md`).

**Reason:** any fixed number chosen before real calibration data exists is a guess dressed up as a parameter — exactly the kind of false precision this entire product is designed to catch in other systems. Picking a number now and never revisiting it would be a quiet double standard.

**Alternatives considered:** no ceiling at all, trusting the deterministic computation fully from day one (rejected — the computation itself is new and unvalidated at launch; a ceiling is a deliberate hedge until the golden-set eval proves the computation trustworthy).

**Status:** Accepted, explicitly provisional.

**Future reconsideration:** mandatory review after the first full golden-set eval run (Phase 2, `PHASES.md`), and any time the eval harness's calibration-error metric moves meaningfully.

---

### ADR-010 — Architecture Agent runs before Feature Extraction Agent

**Decision:** in the pipeline stage ordering, the Architecture Agent (Stage 5) runs before and feeds into the Feature Extraction Agent (Stage 6) — this reverses the ordering given in the original notes toward Design Proposal v2, which listed Feature Extraction first.

**Reason (this is a direct disagreement with the initial ordering, recorded rather than silently changed):** the same symbol can mean different things depending on where it sits architecturally — a file that looks like a stub in isolation may be a deliberate thin adapter in a layered system, or an actually-unfinished feature in a flatter one. Feature Extraction's doc-vs-code diffing (`ARCHITECTURE.md` §3.6) is meaningfully more accurate with an architecture model already in hand than without one. Running them in the reverse or parallel order risks Feature Extraction misjudging structural context it hasn't been given yet.

**Alternatives considered:** running both in parallel (rejected — Feature Extraction genuinely consumes Stage 5's output as input context per `ARCHITECTURE.md` §3.6, so parallel execution would mean either stalling on a partial dependency or accepting a lower-quality first pass); the original notes' ordering, Feature Extraction first (rejected for the reason above).

**Status:** Accepted — supersedes the stage ordering given in earlier project notes.

---

### ADR-011 — Understanding Confidence is excluded from Repository Maturity

**Decision:** what Design Proposal v2 §8 called "Architecture Confidence" — Blueprint's own epistemic confidence in its model of a repository — is renamed **Understanding Confidence** and displayed as a separate reliability badge, never averaged into the Repository Maturity composite score.

**Reason (a real inconsistency found while documenting v2, not a stylistic preference):** Repository Maturity is meant to answer "how good/complete is this repository." Understanding Confidence answers a different question: "how much should you trust everything Blueprint is telling you about this repository." These are different axes — a repository Blueprint merely understands poorly (unconventional layout, unsupported language, sparse docs) is not thereby an immature repository, but averaging the two together would score it as one. This would have shipped a real, user-facing correctness bug had the v2 spec been implemented as written.

**Alternatives considered:** keeping Architecture Confidence as a fourth weighted Maturity component with a small weight (rejected — a small weight doesn't fix a category error, it just makes the error harder to notice); dropping Understanding Confidence entirely (rejected — it's a genuinely useful signal on its own, per `PRD.md` §12's risk section on unconventional repository layouts, just the wrong signal to fold into Maturity).

**Tradeoffs accepted:** two numbers shown instead of one composite; accepted because showing one falsely-composited number would be strictly worse than showing two honestly-separated ones — directly consistent with `RULES.md` §11's confidence-transparency requirement.

**Status:** Accepted — supersedes Design Proposal v2 §8.

---

### ADR-012 — Terminology consolidation

**Decision:** fix three naming inconsistencies discovered during this documentation pass, and treat the resulting terms as fixed vocabulary per `RULES.md` §4: (a) the agent producing `debt` Findings is named the **Debt Agent**, not "Debt & Health Agent" — Health/Maturity is a serving-layer aggregate computed across multiple stages' Findings, never one agent's direct output, and the old name implied otherwise; (b) the Stage 3 Repository Graph is rendered in the UI as the **Architecture View**, and the Stage 7 feature dependency graph is rendered as the **Dependency View** — these must never share a name or be visually merged, since they are different-resolution graphs over different edge semantics (ADR-004); (c) "Repository Graph" refers exclusively to the module/service-level graph, never used loosely as a synonym for "Knowledge Graph" or "the graph" in general.

**Reason:** Design Proposal v2 used "Architecture Graph" (as a UI concept, inherited from v1) alongside "Repository Graph" (as a pipeline concept) without ever stating whether they were the same thing — an ambiguity that would have propagated into inconsistent UI copy and, worse, inconsistent code (two different components built for what engineers might reasonably have assumed were two different graphs, or one component built for what were actually two different graphs).

**Status:** Accepted — binding on all code and copy per `RULES.md` §4.

---

### ADR-013 — Next.js for the frontend

**Decision:** Next.js (App Router) with a Server-Components-by-default architecture (`ARCHITECTURE.md` §15).

**Reason:** the primary Repository Intelligence View is a document-style, mostly-server-rendered read experience (`RULES.md` §18) — Server Components minimize client bundle size and time-to-content for exactly that kind of page, reserving client-side interactivity for the small set of components that genuinely need it (graph rendering, streaming prompt output).

**Alternatives considered:** a client-heavy SPA framework without a server-rendering story (rejected — would push the entire document-style page to client-side rendering for no benefit, directly working against the "reads like a document, loads like one too" goal).

**Tradeoffs accepted:** none material; Vercel deployment (`ARCHITECTURE.md` §1) is a natural fit for this choice, not an independent constraint driving it.

**Status:** Accepted.

---

### ADR-014 — LangGraph retained for agent orchestration

**Decision:** LangGraph orchestrates Pipeline Stages 5–11, evaluated explicitly rather than adopted by default given the original notes flagged it as "if retained."

**Reason:** the pipeline is a genuine DAG with real conditional structure — Stage 7 and 8 run in parallel (`ARCHITECTURE.md` §3.7–3.8), evidence-check failures trigger bounded retries (`ARCHITECTURE.md` §2), and Stage 9's consistency check can trigger a re-run of an earlier stage (`ARCHITECTURE.md` §3.9). This is a graph-with-state problem, not a linear chain, and LangGraph's checkpointing gives resumability on partial failure (`ARCHITECTURE.md` §16) essentially for free.

**Alternatives considered:** a hand-rolled orchestrator (rejected — would reimplement checkpointing, conditional branching, and retry semantics that LangGraph already provides, for a project-stage team that doesn't benefit from owning that complexity); a fully linear chain with no framework (rejected outright — the DAG structure, particularly the parallel Stage 7/8 branch and the Stage 9 retry-trigger, is real, not decorative, and forcing it into a linear shape would either serialize genuinely independent work or bury conditional logic in ad hoc code).

**Tradeoffs accepted:** an added dependency and a real learning surface for anyone new to the codebase; accepted because the DAG structure it models is genuine — this is the one framework dependency in the stack justified by actual structural need rather than convenience.

**Status:** Accepted.

---

### ADR-015 — Evidence-first reasoning as a binding architectural principle

**Decision:** no Finding may be persisted without at least one resolvable evidence citation (`RULES.md` §10, §12); absence claims specifically require a logged, tool-called `search_repository` call with its raw result attached (`ARCHITECTURE.md` §3.6); synthesis-layer agents (Stage 9+) consume only structured upstream Findings, never raw retrieval or another agent's prose (`ARCHITECTURE.md` §3.9).

**Reason:** this is the single mechanism standing between "a system that reasons about code" and "a system that generates plausible-sounding claims about code" — the entire product's credibility rests on this distinction holding under real use, not just in the demo case. It is deliberately over-engineered relative to what a naive implementation would do, because the cost of getting this wrong (a confident, false "X is missing" claim) is asymmetrically higher than the cost of an occasional `ambiguous` result that requires human review.

**Alternatives considered:** trusting LLM self-reported confidence and citations without programmatic verification (rejected — this is the default behavior of most LLM-based tools in this space and is precisely the credibility gap Blueprint is positioned against, per `PRD.md` §14).

**Status:** Accepted — this is the one ADR in this document that should be treated as effectively unamendable without a product-level conversation, not just an engineering one; every other ADR here is a means to this end.

---

### ADR-016 — uv for Python tooling, pinned to CPython 3.12

**Decision:** the API/pipeline package (`apps/api/`) is managed with `uv` (dependency resolution, virtualenv, and interpreter pinning) targeting CPython 3.12, not the 3.14 interpreter that happens to be the machine default.

**Reason:** `uv` is substantially faster than Poetry/pip for the resolve-install cycle and ships a single static binary with no separate Python bootstrap problem, which matters for a solo-maintained project's day-to-day iteration speed. 3.12 is pinned explicitly rather than floating to the newest available interpreter (3.14 at time of writing) because Tree-sitter language bindings, LangGraph, and the Postgres/pgvector driver stack are the kind of native-extension-heavy dependencies that lag brand-new CPython releases by a version or two; pinning to a interpreter with mature wheel coverage removes an entire class of "works on my machine, not in CI" failure before it can happen.

**Alternatives considered:** Poetry (rejected — slower dependency resolution, and `uv` covers the same lockfile/virtualenv workflow without the extra Rust-vs-Python tooling split); floating to the system's default 3.14 (rejected for the reason above — this is a reversible, low-cost decision to make conservatively now and revisit once the native-extension ecosystem catches up).

**Tradeoffs accepted:** one more pinned version to bump later; accepted since bumping a `uv`-pinned interpreter is a one-line change, not a migration.

**Status:** Accepted.

**Future reconsideration:** revisit the 3.12 pin once Tree-sitter/LangGraph/psycopg wheel coverage for 3.14 is verified stable — not on a schedule, on that specific signal.

---

### ADR-017 — npm workspaces for the JS/TS monorepo, not pnpm or Turborepo

**Decision:** `apps/web`, `packages/ui`, and `packages/shared-types` are wired together with native npm workspaces (npm 11, bundled with the machine's Node 24 install), not pnpm or a Turborepo/Nx build-orchestration layer.

**Reason:** at Phase 0's scope (one frontend app, two small internal packages), npm workspaces provide everything actually needed — shared `node_modules` hoisting and local package linking — without introducing a package manager that isn't already on the machine or a task-orchestration tool with no multi-package build graph complex enough yet to justify it. This is the same "adequate now, revisit on a measured trigger" reasoning as ADR-003.

**Alternatives considered:** pnpm (rejected for now — faster installs and stricter dependency isolation are real advantages, but not installed on this machine and not worth an unjustified new tool dependency at Phase 0 scope, per `RULES.md` §1's "never add libraries because they are popular"); Turborepo (rejected — its value is caching/parallelizing builds across many packages, and Phase 0 has exactly one buildable frontend app, so there is no build graph yet for it to optimize).

**Tradeoffs accepted:** npm's install performance and workspace ergonomics are weaker than pnpm's at real monorepo scale; accepted because current scale doesn't exercise that weakness.

**Status:** Accepted, explicitly conditional.

**Future reconsideration:** revisit if/when `packages/` grows enough that build-graph orchestration or install speed becomes a measured pain point — not preemptively.

---

### ADR-018 — Placeholder embedding dimension (1536) pending Stage 4's model comparison

**Decision:** all `vector` columns (`code_chunks.embedding`, `doc_chunks.embedding`, `issues.embedding`) are defined at a fixed width of 1536 dimensions in the Phase 0 migration, explicitly flagged provisional.

**Reason:** `ARCHITECTURE.md` §10 deliberately leaves the embedding model choice open pending an early accuracy/cost comparison (routed via OpenRouter) — that comparison is itself a Phase 0 deliverable ("embeddings + hybrid retrieval interface"), not yet done. But pgvector requires a fixed dimension per column at schema-definition time, and the schema has to exist before that comparison can be run against real data. This is the same shape of problem ADR-009 already solved for the absence-claim confidence ceiling: ship a documented, explicitly-provisional placeholder now rather than block schema work on a decision that can only be made empirically. 1536 is chosen as the placeholder because it's the dimension of the most common current-generation embedding models (e.g. OpenAI `text-embedding-3-small`), making it a reasonable default to migrate away from rather than toward if the eventual choice differs.

**Alternatives considered:** a variable-width column / no fixed dimension (rejected — pgvector's indexing (HNSW, `ARCHITECTURE.md` §11) requires a fixed dimension; there is no deferred-width option that still gets index support); blocking schema work until the embedding model is chosen (rejected — this would stall Phase 0's DB schema PR on a decision that isn't Phase 0's job to make, per `PHASES.md`'s stage-by-stage sequencing).

**Tradeoffs accepted:** if the eventual embedding model comparison lands on a different dimension, every `vector` column needs a migration (drop/recreate, since pgvector can't `ALTER` a column's dimension in place) and a full re-embedding pass. Acceptable because Phase 0 has no production data yet — this migration is cheapest before real embeddings exist, not after.

**Status:** Accepted, explicitly provisional — same status class as ADR-009.

**Future reconsideration:** mandatory review at the same point as ADR-009: once Stage 4's embedding model accuracy/cost comparison actually runs. Track together, since both are "placeholder pending the same piece of missing data."
