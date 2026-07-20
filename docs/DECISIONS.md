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

---

### ADR-019 — File-level attribution on graph_nodes/graph_edges, ahead of incremental indexing actually being wired up

**Decision:** `graph_nodes` and `graph_edges` each get a nullable `file_id` FK to `files.id`, beyond what `ARCHITECTURE.md` §11 currently documents. Populated for Knowledge Graph rows (a symbol node maps to exactly one file; an edge's `file_id` is its source node's file, since that's the file whose parse produced the edge); left NULL for Repository Graph rows, which roll up many files and have no single owner. Alongside this, Stage 2/3 construction (`pipeline/graph/`) is written as pure, per-file functions over `SourceFileFacts` rather than one whole-repository pass, and cross-file edge resolution is a separate, explicit second pass over a repo-wide symbol table.

**Reason:** requested explicitly ahead of implementing Stage 2/3 — optimize today's Knowledge Graph/Repository Graph construction so that wiring up the v1.1 incremental-indexing work specified in `ARCHITECTURE.md` §9 is a straightforward extension, not a rearchitecture. §9 already says the schema should support this "from day one even if the recomputation logic isn't wired up until v1.1"; this ADR is that schema support arriving for the graph tables specifically, at the point those tables are first populated, rather than retrofitted later. Without `file_id`, answering "which graph rows does this changed file own" — the literal question incremental invalidation has to answer — would require either a full-graph rebuild every sync (defeating the point) or an expensive, unindexed scan of `metadata` jsonb. With it, that question is one indexed FK lookup. The pure-per-file-function shape matters independently of the schema change: `ARCHITECTURE.md` §3.2 already commits to "Caching: per-file, keyed on file content hash... unchanged files are never re-parsed into the graph" — that claim is only true if node construction for one file doesn't secretly depend on every other file's state, which is exactly what a pure function signature guarantees and a single monolithic "build the whole graph" function would not.

**Alternatives considered:** deriving file attribution from `graph_nodes.label` at query time (e.g., a label convention like `"path/to/file.py::symbol"`) instead of a real column (rejected — recovering "which file" from a string convention means every future incremental-invalidation query either parses labels or duplicates the convention in application code; a FK is the same information, indexed, with a real constraint instead of an implicit contract); waiting until Phase 8 (v1.1) to add the column via a later migration (rejected for this specific PR — the tradeoff `ARCHITECTURE.md` §9 already accepts is "build the schema now, wire up the logic later," and Phase 8 is explicitly sequenced after all pipeline stages exist *precisely* so it doesn't have to touch every stage's schema retroactively; adding the column when graph_nodes/graph_edges are first created is that same reasoning applied at the moment it's cheapest, not a new precedent).

**Tradeoffs accepted:** two more nullable columns and two more indexes than `ARCHITECTURE.md` §11 currently lists; ADR-corrected there rather than left silently stale. No behavior changes for any code that doesn't yet care about `file_id` — this is additive, not a redesign of anything Phase 0 already shipped (PR1/PR2).

**Status:** Accepted.

**Future reconsideration:** none anticipated before Phase 8 actually implements the recomputation logic this column exists to support — at that point, verify the column answers the invalidation queries Phase 8 actually needs, and extend (not replace) if it doesn't.

---

### ADR-020 — `code_chunks` gets a `content` column, matching `doc_chunks`

**Decision:** `code_chunks` gets a `content` text column (the chunk's actual source text, sliced from `start_line`–`end_line`), beyond what `ARCHITECTURE.md` §11 currently documents.

**Reason:** found while implementing Stage 4's hybrid retrieval (`ARCHITECTURE.md` §3.4: "vector similarity + keyword/BM25 filtering + graph-neighbor expansion"). `doc_chunks` already stores `content` directly per §11; `code_chunks` does not — only `symbol_name`/`symbol_type`/`start_line`/`end_line`/`embedding`/`content_hash`. That asymmetry means keyword search over code chunks has nowhere to search *from* at retrieval time unless a live repository checkout happens to still be available — which nothing in the persisted schema guarantees, and Stage 4's retrieval interface is meant to serve any past snapshot, not just the one from the most recent sync. Storing the slice directly makes retrieval fully self-contained in Postgres, consistent with the rest of the product's "every Finding traceable without needing to re-fetch the source" posture (`PRD.md` §10, auditability) — it would be a strange exception for retrieval specifically to require live repo access when nothing else does.

**Alternatives considered:** re-reading the source line range from a live repo clone at query time (rejected — couples the retrieval interface's availability to whether a checkout still exists for that snapshot, which the architecture doesn't otherwise guarantee or track; also meaningfully slower for a hot retrieval path than a stored column); keyword search limited to `doc_chunks` only, code chunks vector-only (rejected — directly contradicts §3.4's "no stage is permitted to use pure vector similarity as its only retrieval mechanism," and code identifiers/comments are exactly the kind of lexically-precise-but-semantically-sparse text keyword search is best at catching that vector search alone misses).

**Tradeoffs accepted:** some storage duplication (chunk text also exists in the original repository) — accepted for the same reason `doc_chunks.content` already accepts it; function/class-granularity chunks are small relative to full files, and Postgres storage is not the constraint this project is optimizing against (`DECISIONS.md` ADR-006/007).

**Status:** Accepted.

---

### ADR-021 — Embedding provider and vector-retrieval abstraction (ports, not a specific model)

**Decision:** two abstraction seams, both requested explicitly ahead of implementing Stage 4: (1) an `EmbeddingProvider` protocol (`integrations/embeddings/base.py`) that every concrete embedding backend (OpenRouter-routed models, a dependency-free local provider, and — not yet implemented, but slottable without interface changes — direct Voyage/Jina/sentence-transformers backends) implements identically; pipeline/service code depends only on this protocol, selected via a `get_embedding_provider()` factory reading a config value, never on a concrete provider class. (2) A `VectorSearchBackend`/`KeywordSearchBackend` protocol pair (`pipeline/retrieval/interfaces.py`) that the concrete pgvector-and-Postgres-full-text-search implementation (`services/retrieval_service.py`) satisfies — retrieval-calling code (Stage 5+ agents, once they exist) depends on the protocol, never on "pgvector" or a SQL query shape directly.

**Reason:** `ARCHITECTURE.md` §10 already declines to fix a specific embedding model ("model choice left open pending an early accuracy/cost comparison") — that's a decision about *which* model, made empirically, later. This ADR is a different, narrower claim: regardless of which model wins that comparison, or whether the answer changes again after it, the pipeline and retrieval code that calls embeddings should not need to change, because "call a provider, get a vector" and "query for similar chunks" are stable operations independent of which provider or backend implements them today. Concretely: `DECISIONS.md` ADR-009 and ADR-018 already established the pattern of shipping a provisional value now and revisiting empirically later (confidence ceiling, embedding dimension) — an interface seam is what makes "revisit later" actually cheap instead of a grep-and-replace across every caller. This is explicitly an architectural investment ahead of MVP necessity, not a response to a concrete near-term provider switch — recorded as such rather than justified by a need that doesn't yet exist.

**What the abstraction does and does not solve:** it decouples *code* from a specific provider's request/response shape and auth mechanism. It does not make embedding *dimension* free to change without a migration — pgvector's `vector(n)` columns are fixed-width (ADR-018), so a provider whose native model outputs a different dimension than the configured column still requires a schema migration and a full re-embedding pass to adopt, same as ADR-018 already accepts. The two concrete providers shipped now (`OpenRouterEmbeddingProvider`, `LocalHashEmbeddingProvider`) both target the current 1536-dim column specifically so today's swap is config-only; a genuinely different-dimension model remains a deliberate, visible migration, not a silent one.

**Alternatives considered:** hardcoding a single provider (e.g., call OpenRouter's embeddings endpoint directly wherever a vector is needed) and revisiting only if a switch is ever actually needed (rejected per explicit direction — this is exactly the coupling the request asks to avoid, and retrofitting an interface after several call sites already assume one provider's shape is real, avoidable rework, the same category of cost ADR-019's schema-now reasoning already argues against paying twice); a plugin/registry system with dynamic provider discovery (rejected as premature — two concrete providers and a simple config-driven factory function fully satisfy "swappable without touching downstream code" today; a discovery/plugin mechanism is complexity with no current consumer, exactly what `RULES.md` §1 warns against building ahead of a real requirement).

**Tradeoffs accepted:** one more layer of indirection (a protocol plus a factory function) than calling a provider's SDK directly — accepted because the alternative is the coupling this ADR exists to prevent, and the concrete cost here is small (one file per provider, one factory function).

**Status:** Accepted.

**Future reconsideration:** when Stage 4's real accuracy/cost comparison (ADR-018's trigger) actually runs, it should run *through* this abstraction, comparing concrete `EmbeddingProvider` implementations against each other under one eval harness — if the abstraction makes that comparison awkward rather than easy, that's a signal the interface shape is wrong and worth revisiting then, with real evidence instead of speculation.

---

### ADR-022 — `pgserver` as the local/no-Docker fallback for database integration tests

**Decision:** `tests/conftest.py`'s `db_session` fixture prefers a configured, reachable `DATABASE_URL` (CI's real `pgvector/pgvector:pg16` service container); when none is reachable, it falls back to a real, ephemeral Postgres+pgvector instance started via the `pgserver` package (a bundled binary, no Docker or system install required) rather than skipping the test. `pgserver` is a `dev` dependency group addition (`pyproject.toml`), never a runtime dependency of the deployed API/worker.

**Reason:** every integration test written against Phase 0's schema up through this PR had a standing caveat — "skips here (no Docker/Postgres in this environment), runs for real in CI" — which meant real verification only ever happened after a push, never locally, for both this repository's own development and (more importantly) for anyone else developing Blueprint without Docker installed. Discovering that `pgserver` bundles a real Postgres binary *with pgvector already available as an installable extension* removes that constraint entirely: integration tests (`tests/services/test_persistence_integration.py`, `tests/services/test_retrieval_integration.py`) now execute for real, everywhere, not just in CI. This directly serves `RULES.md` §15's testing philosophy ("Deterministic stages... get standard unit and integration tests against fixture repositories — normal software testing, no exceptions") in a way that was previously aspirational for anyone without Docker.

**What this does and does not replace:** it does not replace CI's `alembic upgrade head` step against a real service container — that remains the actual verification that the versioned migration *files* apply cleanly, and stays unchanged. The `db_session` fallback instead uses `Base.metadata.create_all()` against the current ORM models, sidestepping `config.get_settings()`'s `@lru_cache` (which is already fixed to whatever `DATABASE_URL` was first observed by the time any fixture runs, and fighting that cache to redirect it mid-test-session is more fragile than avoiding the need for it). The two remain complementary: CI verifies migration-file fidelity; this fallback verifies business logic (persistence, retrieval) against a real database, in any environment. In practice, both were run manually against the same `pgserver` instance while building this PR (`uv run python` invoking `alembic.command.upgrade` directly against a `pgserver`-backed engine) and produced an identical schema to `create_all()`'s — a one-time cross-check, not a standing guarantee this ADR depends on.

**Alternatives considered:** requiring Docker for local development (rejected — not everyone has it, or wants it, for a Python-only workflow, and the whole point of finding `pgserver` was removing that requirement, not codifying it); installing a system-wide PostgreSQL (rejected — heavier, harder to make reproducible across contributor machines, and `pgserver`'s bundled-binary approach avoids version drift between what's installed locally and what CI runs).

**Tradeoffs accepted:** ~12MB dev dependency; a `pgserver`-backed test run is measurably slower to first-start than a warm Docker container (the bundled Postgres initializes fresh unless the temp data directory persists between runs, which it does by default here). Accepted because the alternative — tests that silently skip their most important assertions outside CI — is a worse trade for a project whose own credibility rests on evidence-based verification (`PRD.md` §14).

**Status:** Accepted.

---

### ADR-023 — RepositoryProvider abstraction (ports, not GitHub-specific code)

**Decision:** two abstraction seams, both requested explicitly ahead of implementing PR3 (GitHub App auth): (1) `integrations/repository/base.RepositoryProvider` — a `typing.Protocol` (`provider_name`, `get_installation`, `list_repositories`, `get_repository`, `get_clone_credentials`) that every concrete Git-hosting backend implements identically; `integrations/repository/github_provider.GitHubRepositoryProvider` is the only MVP implementation. (2) `integrations/repository/registry.get_repository_provider()` is the only place that imports a concrete provider class — `services/repository_connection_service.py` (and, later, any ingestion code that needs clone credentials) depends only on the Protocol.

**Reason:** this is the identical pattern already accepted for embeddings (ADR-021), applied to the same real requirement stated explicitly for this PR: "Repository Intelligence must never depend directly on GitHub APIs... design the authentication layer so future Git providers (GitLab, Bitbucket, Azure DevOps) could be added without rewriting the rest of Blueprint." Concretely, `RepositoryMetadata`/`InstallationMetadata`/`CloneCredentials` (Pydantic models in `base.py`) are provider-agnostic shapes — a full_name, a default branch, a private flag, a short-lived clone URL — that any Git host can produce; nothing in `services/` ever imports `integrations.github.*` for repository access, only for the GitHub-specific OAuth *login* flow (ADR-024), which has no stated multi-provider requirement.

**What the abstraction does and does not solve:** it decouples repository-access *code* from GitHub's specific REST shape and auth mechanism (installation tokens vs. whatever a future provider uses). It does not abstract *login* — OAuth identity is GitHub-specific by design in this PR (ARCHITECTURE.md §14 only ever specifies GitHub OAuth for login), so `services/auth_service.py` and `api/v1/auth.py`'s login/callback routes import `integrations.github.oauth` directly, deliberately outside this abstraction.

**Alternatives considered:** hardcoding GitHub REST calls directly in `services/repository_connection_service.py` and revisiting only when a second provider is actually needed (rejected per explicit direction, for the same reason ADR-021 rejected the equivalent for embeddings — retrofitting an interface after call sites already assume one provider's shape is real, avoidable rework); a plugin/registry system with dynamic provider discovery (rejected as premature — one concrete provider and a config-driven factory function fully satisfy "swappable without touching downstream code" today, per `RULES.md` §1).

**Tradeoffs accepted:** one more layer of indirection than calling GitHub's API directly from the service layer — accepted because the alternative is the exact coupling this ADR exists to prevent, and the concrete cost is small (one Protocol, one concrete provider file, one factory function), mirroring ADR-021's own accepted tradeoff.

**Status:** Accepted.

**Future reconsideration:** when a second Git provider (GitLab, Bitbucket, Azure DevOps) is actually needed, it should be addable as a new module in `integrations/repository/` plus one line in `registry.py` — if that turns out to require touching `services/repository_connection_service.py`, that's a signal the Protocol's shape is wrong and worth revisiting then, with a real second implementation as evidence.

---

### ADR-024 — GitHub App authentication design: installation tracking, token lifecycle, stateless CSRF

**Decision:** several related decisions made together while implementing PR3 (GitHub App Authentication), all in service of ARCHITECTURE.md §14's one-line spec ("GitHub OAuth for login, short-lived JWT for API sessions, GitHub App installation tokens... for repo access — never long-lived PATs") actually being buildable and secure:

1. **New `installations` table** (not in ARCHITECTURE.md's original §11 list) plus a required `repositories.installation_id` FK. Minting an installation access token requires a GitHub installation ID, and nothing in the original schema recorded which installation a connected repository belongs to. `installations` also carries `account_type` (user/organization) so organization-owned installations are a data shape that already exists — the "future organization support" requirement — even though no org-specific UI/permissions ship in this PR. Not nullable on `repositories`, following ADR-019/ADR-020's precedent: Phase 0 has no production data to backfill, so the constraint is correct from the first row.
2. **Two distinct token types, one deliberately never persisted:** the user's OAuth access token (used exactly once, during the login callback, to call `GET /user`/`GET /user/emails`, then discarded — never written to the `users` row or anywhere else) and the GitHub App installation access token (minted via the App's RS256 JWT, cached in-process only, keyed by installation ID, for its own ~1-hour natural lifetime — `integrations/github/installation_tokens.InstallationTokenCache`). Neither is a long-lived PAT; the installation token specifically is only ever minted on demand, per the "generate installation tokens only when required" requirement.
3. **Stateless, signed `state` tokens** (`services/auth_service.create_state_token`/`verify_state_token`) protect both the OAuth login redirect and the GitHub App install redirect from CSRF, without a server-side session store — the token's HMAC signature, short expiry (10 minutes), and a `purpose` claim (`oauth_login` vs. `github_install`) are the entire guarantee. The install flow's state additionally carries the initiating user's ID as `sub`, so the install callback can associate the resulting installation with the right user even though GitHub's redirect is a plain top-level browser navigation with no other session-correlation mechanism required.
4. **Reactive revocation detection, not webhooks:** a 404 from GitHub on any installation-scoped call (`integrations.github.exceptions.GitHubAppNotInstalled`) flips the local `installations.status` to `revoked` (`services/installation_service.mark_installation_revoked`, called from `services/repository_connection_service.py`'s two GitHub-calling functions). Webhook-driven revocation is explicitly v1.1 (ARCHITECTURE.md §14); building it now would mean verifying webhook signatures and standing up a receiving endpoint for a capability this PR doesn't otherwise need.
5. **Row-level scoping stays application-layer for now.** Every installation/repository query in `services/installation_service.py` and `services/repository_connection_service.py` filters by `user_id` explicitly. ARCHITECTURE.md §17's Postgres row-level security is not wired up in this PR (it wasn't wired up in any prior PR either) — noted here rather than silently assumed, since RLS is a materially different guarantee (enforced at the database regardless of query correctness) than an application-layer `WHERE user_id = :current_user` that a future query could forget to include.

**Reason:** each of these was a genuine gap between ARCHITECTURE.md's one-paragraph spec and what a production GitHub App integration actually requires to build — the same "found while implementing, resolved with an ADR, doc updated" pattern as ADR-019/020.

**Alternatives considered:** persisting the user's OAuth token (rejected — the connect flow never needs it again; GitHub's own install-callback redirect already carries the installation ID directly, so there's no need to call `GET /user/installations` with a stored user token to discover it); a server-side OAuth state store, e.g. Redis-backed (rejected — a signed, short-lived, single-purpose JWT gives the same CSRF guarantee without a new stateful dependency on the auth hot path); building webhook signature verification now to detect revocation proactively (rejected for this PR specifically — v1.1 per ARCHITECTURE.md §14, and reactive detection via the 404-on-use path already satisfies "revoked installation" graceful handling without it).

**Tradeoffs accepted:** revocation is detected lazily (on the next API call that needs the installation), not immediately when GitHub is told to uninstall — acceptable because nothing in this PR's scope depends on same-second revocation awareness, and it's the explicitly-deferred-to-v1.1 tradeoff already named in ARCHITECTURE.md §14. Application-layer row scoping instead of Postgres RLS is a known, flagged gap, not a silent one.

**Status:** Accepted.

**Future reconsideration:** Postgres RLS (ARCHITECTURE.md §17) should be revisited as its own dedicated hardening pass, not bundled into a feature PR — track alongside any future PR that first handles genuinely sensitive multi-tenant data at scale. Webhook-driven revocation is already tracked as v1.1 in ARCHITECTURE.md §14 with no change needed here.

---

### ADR-025 — Sync orchestration: `POST /repos/{id}/sync` actually clones and runs Stages 1-3

**Decision:** PR8 ("bare Architecture View") surfaced a real gap ahead of the frontend work it was named for: `ARCHITECTURE.md` §12 names `POST /repos/{id}/sync` and `GET /repos/{id}/snapshots/{snapshot_id}/architecture-graph` as intended endpoints, but neither existed, and nothing tied a connected `repositories` row to an actual clone-and-extract run — PR4-7 exercised the pipeline only against local fixture repos in tests. Since the Architecture View's entire premise (RULES.md §18: "everything shown should be explainable from actual data... no fabricated percentages") requires a real snapshot to read, this PR builds the orchestration, not just the view. Three concrete decisions:

1. **`services/pipeline_runner.run_ingestion_pipeline`** runs Stages 1-3 only (deterministic extraction, Knowledge Graph, Repository Graph) — not Stage 4 (embeddings). Nothing consumes retrieval until Stage 6 (Feature Extraction, Phase 2), so embedding at sync time now would add real clone-to-ready latency with zero current reader, which fails RULES.md §9's "does this improve a Finding" test applied to a pipeline stage. Wiring Stage 4 into the scheduled sync path is a follow-up when Phase 2 actually needs it, not a silent gap — Stage 4 itself (`services/embedding_service.py`) is unchanged and already callable standalone.
2. **`repo_snapshots.commit_sha` becomes nullable** (migration `b7f421a9c6de`). `POST /repos/{id}/sync` creates the snapshot row (status=`indexing`) *before* the clone that would tell it the real HEAD sha — the alternative, resolving a sha via a separate GitHub API call at request time and trusting it, has a real race (the branch can move between that resolution and the clone actually happening in the worker). Instead, `run_ingestion_pipeline` resolves the true post-clone HEAD sha itself and populates the column once known — the same "starts unknown, transitions once known" shape `status` already has, not a new pattern.
3. **`integrations/queue/rq_queue.py`** wraps the one `Queue.enqueue()` call (RULES.md §6: every external call wrapped once) — `services/sync_service.trigger_sync` depends on `enqueue_ingestion_job`, never on `rq`/`redis` directly, which is what makes `POST /repos/{id}/sync` testable via `TestClient` without a real Redis instance running (this environment has none, same constraint as Docker/`pgserver` — see `docs/MEMORY.md`'s PR2 entry). A `RedisError` on enqueue marks the just-created snapshot `failed` rather than leaving it stuck `indexing` with no corresponding job, and surfaces as a 503 to the caller.

The read side (`services/snapshot_service.py`: `list_snapshots`, `get_snapshot`, `get_architecture_graph`) is a set of direct aggregate queries over `files`/`graph_nodes`/`graph_edges` for one snapshot — language mix, Tree-sitter full/low confidence counts, Knowledge Graph node/edge counts, and the Repository Graph's own nodes/edges. Nothing here is inferred or LLM-touched; every number traces to a single `GROUP BY` or `COUNT` over Phase 0 tables, which is what lets the Architecture View show them without violating RULES.md's "no fabricated percentages" rule.

**Reason:** the same "found while implementing the stage that needed it, resolved with an ADR, doc updated" pattern as ADR-019/020/024 — PR8 cannot honestly render "Indexing Status," "Tree-sitter Status," or an Architecture Graph for a connected repository without something that actually produces a snapshot.

**Alternatives considered:** shipping the Architecture View against mock/static data and deferring sync orchestration to a later PR (rejected per explicit direction — conflicts with "wire everything to the existing APIs, no fabricated data"); resolving the commit sha via a GitHub API call at `POST /sync` request time and keeping `commit_sha` non-nullable (rejected — see point 2 above, the race is real and the nullable-then-populate shape is both simpler and already-precedented by `status`); running Stage 4 (embeddings) as part of the sync path now (rejected — see point 1, no current consumer).

**Tradeoffs accepted:** a snapshot can briefly exist in `indexing` status with `commit_sha=null` — any reader (the architecture-graph endpoint, the frontend) must treat a null `commit_sha` as "still resolving," not an error state. No automatic retry on a failed sync (RQ's default failure handling — the job lands in the `FailedJobRegistry`, no retry storm risk, but also no self-healing) — acceptable for Phase 0's single-user, manually-triggered-resync scope; revisit if/when webhook-driven sync (v1.1, ARCHITECTURE.md §14) needs its own retry policy anyway.

**Status:** Accepted.

**Future reconsideration:** when Phase 2 (Feature Extraction) actually needs retrieval, decide then whether Stage 4 joins the scheduled `/sync` path or stays a separate on-demand step — real consumer, real evidence, same posture as ADR-018/021's "revisit empirically" pattern. If RQ's no-retry default proves too brittle against real transient GitHub/network failures, a bounded retry belongs in `integrations/queue/rq_queue.py`, not scattered into `pipeline_runner.py`.

---

### ADR-026 — Global search is lexical and server-grouped, not semantic

**Decision:** the ⌘K palette is backed by a new `GET /repos/{id}/search?q=` endpoint (`services/search_service.py`) that does **literal matching over names Blueprint already extracted** — `files.path`, `code_chunks.symbol_name`, `doc_chunks.section_title`, the snapshot's regex-matched `api_routes`, the manifest's verbatim README sections, and the user's own `threads.title`. No embedding call is made on this path. Results are grouped and ranked server-side (Files, Folders, Functions, Classes, Symbols, Routes, README, Documentation, Threads) and returned pre-matched; the palette renders them verbatim rather than filtering a second time.

**Reason:** search has two distinct jobs and they want opposite architectures. "Take me to the thing I can already name" must answer between keystrokes, which rules out a network round-trip to an embedding provider before the query can even be run. "Explain what this repository does" is inherently semantic — and already has a home in Threads (`services/thread_retrieval.py`), which is built for exactly that and cites its evidence. Splitting them keeps each honest: the palette never pretends to understand intent, and Threads never pretends to be instant. This is RULES.md §1's "deterministic before probabilistic" applied to a serving-path feature rather than a pipeline stage.

Server-side grouping (rather than fetching an index to the client) follows RULES.md §14's existing rule for Findings — the frontend never pulls everything and filters locally — and is also what keeps the payload small enough to re-request per keystroke.

**Alternatives considered:** reusing `HybridRetrievalService` for the palette (rejected — its vector leg costs a provider round-trip per query, and its RRF fusion is tuned to produce *evidence for an answer*, not a jump list; a palette wants the exact `main.py` you typed, not the five chunks most semantically adjacent to it); shipping a client-side index of all names fetched on repo load (rejected — unbounded payload for large repositories, goes stale against re-syncs, and contradicts RULES.md §14); adding a dedicated search engine such as Meilisearch or Elasticsearch (rejected — same "adequate now, no new datastore" reasoning as ADR-003/ADR-006; `ILIKE` over already-indexed columns is sufficient at Phase 0/1 scale and adds no operational surface).

**Tradeoffs accepted:** the palette finds nothing for a conceptual query ("where does auth happen?") unless a name literally matches — deliberate, and the empty state names Threads as the place for that class of question rather than silently returning nothing. Ranking is a hand-written integer score (exact > prefix > word-boundary > substring, shorter wins ties), not BM25; it is unit-tested (`tests/services/test_search_service.py`) and can be replaced without touching either the endpoint or the palette. Folder derivation scans file paths per query rather than maintaining a folders table — bounded by an explicit scan limit, and revisitable if profiling shows it matters.

**Status:** Accepted.

**Future reconsideration:** if repositories get large enough that `ILIKE '%needle%'` stops being instant, the first move is a trigram (`pg_trgm`) GIN index on `files.path` and `code_chunks.symbol_name` — same datastore, no new dependency — before any dedicated search engine is considered. If users repeatedly type conceptual queries into the palette (worth measuring), the right answer is likely a "ask Threads about this" affordance in the empty state, not bolting vector search onto this path.

---

### ADR-027 — Live GitHub repository metadata is read per request, never snapshot-scoped

**Decision:** stars, forks, watchers, open issues, primary language, license, tip commit, and the contributor list are served by two new endpoints — `GET /repos/{id}/status` and `GET /repos/{id}/contributors` — backed by `services/repository_status_service.py` and two new `RepositoryProvider` methods (`get_repository_status`, `list_contributors`). None of it is persisted. The Briefing renders it alongside study-derived facts in the same chip row, and the route starts both fetches without awaiting them, handing the promises to `BriefingRoom`, which suspends each behind its own skeleton.

**Reason:** every other number Blueprint displays is snapshot-scoped and immutable (`ARCHITECTURE.md` §2) because it was computed from a specific commit and stays true for that commit forever. These are the opposite: they change while Blueprint is doing nothing. Writing them to a `repo_snapshots` column would create a row that is stale the moment it lands and would then be indistinguishable, at read time, from the deterministic facts around it — the worst possible failure for a product whose whole claim is that its numbers are earned. Reading them live keeps the provenance boundary legible: persisted means computed by a study, fetched means true as of now.

Streaming them rather than awaiting them follows from the same reasoning. The Briefing's actual subject is what Blueprint understood; GitHub is context around it. A rate-limited or slow third party must not delay the study readout, so each GitHub-sourced region suspends alone. `RULES.md` §5 still holds — the route owns the fetch, it just passes the promise instead of the resolved value.

**Reason it is not `RULES.md` §23 scope creep:** §23 bans features whose *primary value* is a metric GitHub already shows. These are not the feature; they are attribution and freshness context on a page whose primary value is Blueprint's own read. The test applied was "does removing this leave the Briefing saying the same thing?" — without contributors, the Briefing describes a repository with no account of who built it, which is a real gap in an executive summary, not a chart for its own sake.

**Alternatives considered:** persisting the numbers on `repo_snapshots` (rejected — see above; also makes every re-read of an old snapshot a lie about the present); a single combined `/github` endpoint (rejected — contributors is the slower call and the larger payload, and coupling them means the status row waits on it for no reason); fetching client-side after hydration (rejected — pushes the session cookie forwarding and error taxonomy into the browser, and duplicates the typed-exception mapping `api/errors.py` already owns).

**Tradeoffs accepted:** two extra GitHub calls per Briefing load against the installation's rate limit, with no caching layer beyond the provider's HTTP client — acceptable at current scale, and the first thing to revisit if rate limiting shows up in practice. Contributor "last contribution date" is **not** shown: GitHub's contributors endpoint carries no date, and `/stats/contributors`, which does, is computed asynchronously and answers 202 while it warms. A column that is sometimes a date and sometimes a dash is worse than no column, and inferring one would be exactly the fabricated number §23 bans. The contributor list is capped at 30 (one page, provider-ordered by commit count), and the response carries `truncated` so the UI states that percentages are shares of the listed set rather than of the whole history.

**Status:** Accepted.

**Future reconsideration:** if rate limiting bites, the fix is a short-TTL cache in `integrations/` keyed by installation + repository — not persistence, which would reintroduce the staleness problem this ADR exists to avoid. If `/stats/contributors` is ever worth the 202-polling complexity, a real last-contribution date can be added additively without changing either endpoint's existing shape.

---

### ADR-028 — The Atlas draws the whole architecture unconditionally; selection focuses it, never summons it

**Decision:** the Atlas room is two permanent panes. Left is the file explorer (`components/atlas/RepositoryExplorer.tsx`), unchanged. Right is `AtlasGraph`, which now renders the **complete** repository graph — every module, every import edge — at full panel height, from first paint, with no selection required. Selection is a controlled prop rather than internal state: choosing a folder lights that boundary and its one-hop neighbourhood, fades the rest, and eases the viewport onto the region via three springs. Nothing is unmounted, filtered out, or replaced. A container folder such as `apps/` lights every boundary beneath it, so the graph is its own chooser and the previous `ContainerPane` card is gone, along with `ModulePane` and `EmptyPane`. The selection is bidirectional — clicking a node moves the tree, clicking the tree moves the map. The canvas is an instrument: drag to pan, wheel or controls to zoom, hover to trace strands without committing.

**Reason:** the Atlas originally opened on the constellation, which put implementation detail on screen before anyone asked for it; the correction was to lead with structure and make the graph a consequence of a click. That correction over-shot. It bought the right landing view at the cost of hiding one of Blueprint's signature visualizations behind an interaction nobody was prompted to perform, and it left an empty detail card sitting where the architecture should have been — the right pane's default state was a sentence apologising for its own emptiness. The explorer was never what was wrong with the old room; leading with *implementation detail* was. A complete architecture map is not implementation detail — it is the single clearest statement of what the repository is, and it belongs on screen for the same reason the file tree does.

Keeping one scene and re-weighting it, rather than swapping scenes, is the substance of the decision. The layout is already deterministic (keystone at centre, ring = real graph distance), so a module's dependency graph and the repository's graph are *the same drawing at different emphasis*. Animating opacity and viewport across that shared layout means the selected module is legibly a region of the system, and the reader never loses their place. Replacing the pane would have thrown away the spatial memory the deterministic layout exists to build.

**Reason the visual map is not behind "Stats for nerds":** that gate holds raw material — the flat module inventory and the whole import web as text. A picture that answers "what shape is this system" in one glance is the opposite of a power-user affordance. What stays gated is unchanged.

**Alternatives considered:** restoring the pre-explorer landing page (rejected outright — it is the design the explorer correctly replaced, and the brief that prompted this asked specifically not to); rendering the graph as a card inside the detail pane (rejected — a small canvas of a 40-module graph is unreadable, and the panel exists to be filled); leaving the aside beside the canvas as before (rejected — a 19rem text column takes a fifth of the stage from the thing it annotates, so the module reading is now a floating overlay on the map, which preserves the RULES.md §16 text equivalent without costing the graph its width); computing a filtered subgraph per selection (rejected — this is the "replace everything instantly" failure, and it discards the stable layout).

**Tradeoffs accepted:** pan/zoom state lives in framer-motion springs rather than React state specifically so a drag doesn't re-render every node per frame — the zoom readout is a `useTransform` over the spring for the same reason. The viewport auto-frames on selection, which is motion the user didn't directly request; it is bounded to selection only (hover never moves the canvas, because a stage that lurches under a passing pointer is unusable) and is fully undone by the "Whole repository" control or a click on empty space. Wheel-over-map zooms rather than scrolling the page, which is a map convention but does cost page scroll within the panel's bounds; below `xl` the SVG is `touch-pan-y` so a phone can still scroll past a full-height map. Pointer-to-viewBox mapping has to undo `preserveAspectRatio="xMidYMid meet"` letterboxing by hand, since the panel is never exactly 880:600.

**Status:** Accepted.

**Future reconsideration:** the deterministic orbital layout is legible to roughly the module counts seen so far; if a repository produces enough boundaries that rings collide, the answer is hierarchical collapse (fold a container's boundaries into one node until it is selected) rather than a force-directed layout, which would forfeit the stable-across-visits property this layout is chosen for.

---

### ADR-029 — Exactly one search surface, and it is the ⌘K palette

**Decision:** Search is removed from `WORKSPACE_NAV` and from the dock. The only search affordance in the product is the top pill's button, which — like ⌘K itself — flips the single `paletteOpen` bit in `WorkspaceShell` and renders the single `WorkspaceCommandPalette`. The dock is now rooms only, and `WorkspaceNavItem` loses its `action` escape hatch, so the nav model can no longer express "an entry that isn't a destination."

**Reason:** the two entry points were already one implementation, one component, and one piece of state — but users do not read source. Two differently-shaped search controls, in two different pieces of chrome, on every screen, is indistinguishable from two search features, and the cost is paid on every glance: *which one is the one I want?* The nav model's own comment said Search "is an action, not a room" while listing it among the rooms, which is the contradiction the UI was faithfully rendering.

The top pill keeps it because that is where the shortcut hint already lived and where utilities (notifications, theme, account) already live; the dock is for navigation, and search is not navigation until you have typed something.

**Alternatives considered:** keeping the dock entry and dropping the top-pill button (rejected — the button is where the ⌘K affordance is discoverable, and the dock is the one surface whose job statement is rooms); keeping both and visually differentiating them (rejected — this treats a duplicate-concept problem as a styling problem); a dedicated `/search` route (rejected, and none existed — a route would make search a place, which is the framing this ADR removes).

**Tradeoffs accepted:** the top-pill button collapses to an icon below `md`, so on a phone the affordance is smaller than the dock entry was. That is the correct trade — one small control beats two competing ones — and the palette itself is unchanged and full-screen when opened.

**Status:** Accepted.

---

### ADR-030 — In Threads, the answer is anchored and evidence is folded

**Decision:** the Threads transcript auto-scrolls **once per turn**, at the moment the question is posted, and it scrolls to the *question heading*, not to the bottom. After that the room never touches scroll position again. `Repository Evidence` renders collapsed by default behind a disclosure; a `[n]` marker in the prose expands it and jumps to the cited card.

**Reason:** the previous effect followed the conversation to its bottom on every change, and its dependency list included `live.evidence.length`. Evidence lands *after* the prose begins streaming, so the last automatic scroll of every turn reliably parked the viewport on the evidence grid — the reader had to scroll back up to read the answer they had just asked for. Anchoring the question instead makes the correct viewport a consequence of one deliberate movement: the heading holds still, the answer streams downward into the space beneath it, and anything arriving below the fold moves nothing. "Keep the answer anchored while it streams" turns out to require *no* continuous scrolling, only the right one-time target.

Folding evidence follows the same hierarchy from the other direction. PRODUCT.md's rule is interpretation above evidence, with evidence always present and one click from the claim — a permanently expanded grid of source cards under every turn satisfies "present" while inverting "above." Collapsed-by-default satisfies both, and has the useful property that evidence growing after citations resolve cannot change layout the reader is looking at.

**Alternatives considered:** scroll-anchoring the container via `overflow-anchor` (rejected — browser support for the property is uneven and it addresses content growing *above* the viewport, which is not this bug); keeping the follow-to-bottom behaviour but excluding `evidence.length` from the deps (rejected — it fixes this instance and leaves the room fighting the user's scroll on every token); pinning the answer with `position: sticky` (rejected — an answer of arbitrary length cannot stick, and the question heading is the stable thing worth pinning anyway).

**Tradeoffs accepted:** opening a stored thread lands on its latest exchange rather than its top, which is a second automatic scroll — it is instant rather than smooth, fires once per thread, and is where the thread *opens* rather than a movement to follow. Readers who want evidence visible must expand it per answer; there is no persisted preference, which is worth adding if the expand becomes reflexive.

**Status:** Accepted.

---

### ADR-031 — Concurrent repository studies: a bounded worker pool plus a real `queued` state

**Decision:** studies run concurrently, up to `MAX_CONCURRENT_STUDIES` (`config.Settings.max_concurrent_studies`, default 4). `worker.py` runs an `rq.WorkerPool` of that size instead of a single `Worker`; work beyond the cap waits in the existing Redis queue. `SnapshotStatus` gains `QUEUED` (a study handed to the queue that no worker has claimed) and `CANCELLED` (terminal, user-initiated only). `repo_snapshots` gains `job_id` and `started_at`. `pipeline_runner._claim_snapshot` promotes `QUEUED -> INDEXING` with a conditional UPDATE, and `snapshot_service` judges a waiting study against the queue's own record of its job rather than against a clock.

**Reason:** Blueprint could study exactly one repository at a time, and the second attempt did not queue — it *failed*. Two causes compounded, and only fixing both resolves it.

A single RQ worker consumes its queues strictly serially, so a second study's job sat in Redis behind the first. That alone would merely have been slow. What made it a failure is that `sync_service` created the snapshot as `INDEXING`, so a waiting study was recorded in the same state as one a worker was actively running — and with no `current_stage`, which is precisely the shape of a worker that died before its first stage. `snapshot_service._mark_stalled_if_needed` therefore did exactly what it was designed to do and failed it after `_NOT_STARTED_STALL_SECONDS` (20s), reporting "the worker process likely crashed or was never running" about a worker that was busy and a queue that was working. The stall detector was not buggy; the state vocabulary was too small to tell it the truth. `QUEUED` is that missing word, which is why this is a status change and not a change to the detector's thresholds.

Judging a queued study on a timer is not fixable by raising the timeout, either: a study's legitimate wait is however long the studies ahead of it take, which is unbounded and unknowable in advance. So the question changes from "how long has it waited" to "does its job still exist", answered by `rq_queue.job_presence` from real queue state. Its three-way return (`LIVE`/`LOST`/`UNKNOWN`) is load-bearing — only `LOST` may fail a study, since treating an unreachable Redis as a dead job would fail every in-flight study over a momentary blip.

**Why the pool is bounded, and why the default is small:** each worker runs a full study — a clone, a Tree-sitter parse of every file, hundreds of embedding calls. Those contend for CPU cores, the repository provider's rate limit, and the embedding provider's concurrency, none of which get faster under more load. Past a handful of workers every study slows without any finishing sooner, so the queue is the honest place for the surplus. The value is env-configurable precisely so raising it is a config change, not a code change.

**How races are prevented:** three layers, narrowing. Redis pops each job to exactly one worker; the job id *is* the snapshot id, so a repeated `/sync` for one snapshot cannot create a second job; and `_claim_snapshot`'s `UPDATE ... WHERE status = 'queued'` means even a redelivered job can only be executed by whichever worker wins the row (`rowcount == 0` raises `SnapshotAlreadyClaimed`, which `run_ingestion_job` declines quietly rather than failing). Cancellation writes `CANCELLED` under the same conditional-UPDATE discipline *before* touching the queue, which is what closes the window against a worker about to claim it.

**How isolation is guaranteed:** it largely already was, which is why the pipeline needed no rewrite. Every study opens its own `Session`, gets its own `tempfile.TemporaryDirectory`, keeps progress in locals and in its own row, and writes only rows keyed to its own `snapshot_id`. There is no module-level mutable state in `pipeline_runner`. The one shared thing is the snapshot row, and the claim settles ownership of it before any work begins.

**Alternatives considered:** raising `_NOT_STARTED_STALL_SECONDS` (rejected — no constant is correct when the legitimate wait depends on other repositories' study durations, and a large one would delay reporting genuinely lost jobs); rejecting a second `/sync` with 409 while any study runs (rejected — it makes the limitation a documented feature rather than removing it); threads rather than processes inside one worker (rejected — the parse stages are CPU-bound and would contend on the GIL, and processes are what RQ already gives us); a separate queue or worker per repository (rejected — unbounded workers, which is the resource problem this ADR exists to bound).

**Tradeoffs accepted:** `estimated_total_seconds` now measures `completed_at - started_at` rather than `- created_at`, so historical averages describe real work and are not inflated by queue waits — but studies completed before `started_at` existed fall back to `created_at` and keep their old, wait-inclusive durations in the average until they age out of the 5-study window. Cancellation of a *running* study is cooperative and lands at the next stage boundary, not immediately: the stages have no safe interior cancellation point, and killing one mid-parse risks the partial writes `StageTimeoutExceeded` already refuses to risk. On Windows the pool members are `SimpleWorker`s, so concurrency across studies is real but the per-job process boundary within a worker is not.

**Status:** Accepted.

---

### ADR-032 — The Atlas is a semantic-zoom map: level of detail is a pure function of the viewport

**Decision:** the Atlas no longer draws every module at once. `lib/atlas-hierarchy.ts` builds a containment hierarchy from real data only — top-level directories ("domains"), the backend's Stage-3 module boundaries, folders, files — lays the whole tree out once, deterministically, in nested world coordinates, and `AtlasGraph` reveals it by *level of detail*: a container opens when its projected on-screen radius crosses a pixel threshold, and folds closed again below it. There is no expansion state to manage — the viewport (pan + zoom) *is* the state. Clicking a closed container zooms until it opens, which is the same gesture spelled as a click. Import edges exist only at module level (the only level the backend measured), so edges are aggregated to the visible frontier, each strand carrying the count of real module→module import paths it stands for; files never grow edges, because file-level imports are not data the page has. Rendering is bounded: closed subtrees, off-viewport subtrees, and sub-3px nodes are culled with their descendants, with a hard cap as a seatbelt. A minimap (large repositories only) and an in-graph search (highlight, fly, pulse) complete the instrument.

**Reason:** for large repositories the flat constellation was technically correct and unusable — hundreds of labeled nodes and every edge at once answers "render every dependency" when the room's question is "how is this repository organized?" (PRODUCT.md: the Atlas answers *shape*). Overview-first with progressive disclosure keeps the first screen at a handful of real architectural areas, and keeps every deeper level exactly one zoom away. Making LOD a pure function of the viewport (rather than per-node expand state) means the map behaves like a map — Google Maps does not let you open a street while looking at a continent — and eliminates a whole class of state-drift bugs between zoom and expansion.

**Alternatives considered:** per-node manual expand/collapse state (rejected — two sources of truth for what's visible, and a zoomed-out screen full of opened clusters recreates the original overload); force-directed clustering (rejected — the layout would rearrange between visits, violating the room's "same repository, same sky" determinism); server-computed clusters (rejected — the hierarchy is already fully derivable client-side from module labels + file paths, and inventing a second rollup risks disagreeing with Stage 3's).

**Tradeoffs accepted:** ADR-028's "the map is always the whole repository" now holds at the overview altitude rather than at module altitude — selection still focuses and never summons, but a module deep in a closed domain is represented by its domain's node until zoom opens it (edges honestly aggregate to that anchor). Symbol-level LOD (functions at maximum zoom) is deferred: the browser has no symbol data today, and drawing it would require an API addition, not a fabrication.

**Status:** Accepted.

---

### ADR-033 — HeroUI v3 is the component layer; Blueprint tokens stay the design authority

**Decision:** `@heroui/react` + `@heroui/styles` (v3, React Aria-based, Tailwind v4-native) become the default component library. `@blueprint/ui` keeps its public API and remains the only import surface the app uses, but its generic primitives are now HeroUI-backed internally: Button, Badge (Chip), Input/TextArea (TextField + Label/Description/FieldError), Dialog (Modal), Drawer, Skeleton, Spinner, Kbd, Divider (Separator), plus a new Tooltip primitive. HeroUI's semantic CSS variables (`--accent`, `--surface`, `--field-*`, radius scale, …) are bridged to Blueprint's own tokens in `globals.css`, unlayered so they win the cascade in both themes; HeroUI's calculated hover/soft variants derive from them automatically. The bespoke experiences stay custom: Atlas/graphs, Threads, Repository Explorer, CommandPalette, the FX primitives (Reveal/Tilt/Magnetic/Float), Toast (its queue contract), and Popover (its deliberate scroll/click-through behavior).

**Reason:** one cohesive component system with React Aria's keyboard, focus-trap, ARIA, and press semantics for free — the hand-rolled overlay plumbing in `overlay.tsx` was correct but was one implementation of a solved problem, and every new control was re-deriving it. Wrapping (rather than adopting HeroUI's look) preserves the visual identity outright: the glass materials, ink monochrome, single electric accent, pill radii, and motion grammar are Blueprint's, applied as utility classes that outrank HeroUI's BEM layer by cascade design.

**Alternatives considered:** adopting HeroUI's components directly at call sites (rejected — churns every screen, couples the app to a vendor API, and HeroUI's default look would erode the identity); shadcn/radix (rejected — HeroUI was chosen by the product owner, ships Tailwind v4-native styling with a themable variable bridge, and its local docs live in-repo at `.heroui-docs/`); rebasing Popover/Toast too (deferred — their bespoke behaviors are documented product decisions, and HeroUI's equivalents would change them).

**Tradeoffs accepted:** a vendor dependency in the design system's foundation (mitigated: call sites only know `@blueprint/ui`, so the vendor is replaceable in one package); two motion systems coexist (React Aria data-attributes for micro-interaction, framer-motion for choreography) — acceptable because they never animate the same property.

**Status:** Accepted.
