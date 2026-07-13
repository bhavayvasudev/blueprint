# Blueprint — Architecture

Status: engineering bible. Every implementation decision should be traceable to this document or to an ADR in `DECISIONS.md` that supersedes it. If code and this document disagree, that disagreement is a bug in one of them — file it, don't silently pick one.

Source of truth for product intent: `PRD.md`. This document is *how*, not *why*.

---

## 1. High-Level Architecture

Three planes, deliberately separated so the expensive, slow work (indexing, reasoning) never blocks the fast plane (viewing the product):

**Ingestion plane** — clones/pulls repositories, runs deterministic extraction (Tree-sitter, manifests, git log), builds the Knowledge Graph and Repository Graph, generates embeddings. Triggered by connect, manual sync, or (v1.1+) webhook.

**Reasoning plane** — the LangGraph-orchestrated 11-stage pipeline (§3) that consumes the ingestion plane's output and produces Findings. Runs as a background job, never inline with a user-facing request except for on-demand Prompt Generation (Stage 11), which is a light, targeted retrieval pass, not a re-run of the full pipeline.

**Serving plane** — FastAPI reads persisted Findings and snapshot data; the Next.js frontend renders them. Nothing in the request path re-runs LLM reasoning live except Stage 11.

```
                    push / webhook
GitHub  ------------------------------>  Ingestion Worker(s)
                                                |
                                                v
                                       Postgres + pgvector
                                  (snapshots, graphs, embeddings,
                                         Findings)
                                                ^
                                                |
                                       Reasoning Pipeline
                                    (LangGraph, background)
                                                |
                                                v
                    Redis (queue + cache)  <-->  FastAPI  <----- Next.js Frontend
                                                              (Vercel; drives on-demand
                                                               Prompt Generation via
                                                               targeted retrieval)
```

Deployment: Next.js on Vercel, FastAPI + workers on Railway (persistent processes, longer-running jobs than serverless comfortably supports), Postgres+pgvector managed (Railway Postgres or Neon), Redis on Railway for queue + cache. See §17.

## 2. Finding Lifecycle

The Finding (defined fully in `PRD.md` and Design Proposal v2 §3) is the only artifact the reasoning plane produces. Its lifecycle:

1. **Proposed** — an agent (Stage 5–11) produces a candidate Finding with evidence, reasoning, and a provisional confidence band (high/medium/low, LLM-proposed — never the final number).
2. **Evidence-checked** — every citation in the Finding's `evidence[]` is programmatically resolved against the actual repository content (file exists, symbol exists at the cited location, commit/issue ID exists). A Finding with an unresolvable citation is rejected and triggers a bounded retry of the producing agent with a corrective instruction — it never reaches storage unverified.
3. **Confidence-computed** — the final numeric confidence is derived deterministically from evidence count, retrieval quality, and cross-agent agreement, per `RULES.md` §Confidence Conventions — not the LLM's provisional band directly.
4. **Consistency-checked** — Stage 9 (Repository Reasoning) diffs new Findings against existing ones for contradiction; a contradiction populates `contradicts[]` on both and either triggers a bounded re-run of the earlier stage or downgrades both to `ambiguous`, surfaced transparently.
5. **Persisted** — written to the `findings` table, linked to the `repo_snapshot` it belongs to, immutable once written (a re-sync produces new Findings in a new snapshot; existing Findings are never mutated in place — see §11).
6. **Served** — read by the API, rendered by the frontend, and — for `roadmap_item` Findings specifically — available as input to on-demand Prompt Generation.

A Finding is never edited after step 5. If a later sync produces a contradicting or superseding Finding, that's a new row with a `supersedes` pointer, not a mutation — this preserves the full historical reasoning trail per repository, which both `PRD.md` §10 (auditability) and the eval harness (§16) depend on.

## 3. The Repository Intelligence Pipeline

Eleven stages. Stages 1–4 are deterministic/infrastructure; Stages 5–11 are LLM agents. This ordering corrects Design Proposal v1's sequencing (Architecture Agent now runs before Feature Extraction — see `DECISIONS.md` ADR-010 for the reasoning).

| # | Stage | Kind | Consumes | Produces |
|---|---|---|---|---|
| 1 | Deterministic Extraction | deterministic | raw repo | AST facts, manifests, commit/author metadata, raw TODOs |
| 2 | Knowledge Graph | deterministic | Stage 1 | symbol-level graph: functions, classes, imports, calls, types |
| 3 | Repository Graph | deterministic + heuristic | Stage 2 + folder/config | module/service-level graph |
| 4 | Embeddings + Hybrid Retrieval | infrastructure | Stage 1–3 + docs | vector index; a retrieval interface every later stage calls |
| 5 | Architecture Agent | LLM | Stage 3 + manifests | architecture narrative + structured model (layers, services, stack) |
| 6 | Feature Extraction Agent | LLM + tool-use | Stage 4, 5 | `feature_status` Findings: verified / doc-ahead-of-code / code-ahead-of-docs / ambiguous |
| 7 | Dependency Agent | LLM | Stage 6 | Depends On / Blocked By / Blocks Findings |
| 8 | Debt Agent | LLM | Stage 6 (parallel with 7) | `debt` Findings |
| 9 | Repository Reasoning Agent | LLM | Stage 6, 7, 8 (structured, not prose) | narrative synthesis Findings + consistency check |
| 10 | Roadmap Agent | LLM | Stage 9 only | `roadmap_item` Findings, dependency-ordered |
| 11 | Prompt Generation Agent | LLM + retrieval | a selected Finding + fresh targeted retrieval | executable prompt text, on demand, not part of scheduled runs |

### 3.1 Stage 1 — Deterministic Extraction

**Input:** cloned repository at a specific commit SHA. **Output:** per-file AST facts (via Tree-sitter, see §4), parsed dependency manifests (`package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`, etc.), commit metadata (author, timestamp, message, files touched), and TODO/FIXME locations cross-referenced to the enclosing function via the AST (a TODO is linked to a symbol, not just a line number).

**Failure mode:** unsupported language. **Handling:** falls back to a generic heuristic extractor (regex-based symbol detection); every fact produced this way is tagged `low_structural_confidence`, which caps the confidence ceiling of every downstream Finding touching that file. Never silently treated as equal-quality to a Tree-sitter parse.

### 3.2 Stage 2 — Knowledge Graph

**Input:** Stage 1 facts. **Output:** a property graph — nodes are functions/classes/modules, edges are imports/calls/references. This is the fine-grained, "what calls what" layer. Stored as adjacency tables in Postgres (§11), not a dedicated graph database — see `DECISIONS.md` ADR-003 for why that's deferred, not rejected.

**Caching:** per-file, keyed on file content hash (§9). Unchanged files are never re-parsed into the graph.

### 3.3 Stage 3 — Repository Graph

**Input:** Stage 2 + folder structure + config/manifest signals (Dockerfiles, entrypoints, conventional `services/`/`packages/` layout). **Output:** a coarser, module/service-level graph — the "what depends on what at an architectural level" layer. This is a deliberately distinct artifact from Stage 2, not a coarsened view of it computed on the fly — see `DECISIONS.md` ADR-004.

**Failure mode:** heuristic rollup misjudges module boundaries on an unconventional layout. **Handling:** Stage 5 (Architecture Agent) is permitted to override specific rollup decisions when it has stronger evidence, but every override is itself a Finding-like record with its own evidence, and a high rate of overrides on a given repository is exactly what depresses that repository's Architecture Confidence (§7.4).

### 3.4 Stage 4 — Embeddings + Hybrid Retrieval

**Input:** Stage 1–3 outputs plus documentation (README, `/docs`, docstrings). **Output:** a queryable retrieval interface, not a user-facing artifact. Code chunked at function/class granularity (never fixed-token windows — that cuts through logical units and measurably degrades retrieval precision); docs chunked at section granularity. Embeddings stored in pgvector. Retrieval for any downstream stage is hybrid: vector similarity + keyword/BM25 filtering + graph-neighbor expansion from Stage 2/3 (pulling in embeddings of structurally adjacent nodes to the top vector hits, since pure vector search systematically misses structurally-relevant, lexically-dissimilar code).

**Caching:** chunk-level, keyed on content hash.

### 3.5 Stage 5 — Architecture Agent

**Input:** Stage 3 + manifests. **Output:** an architecture narrative and structured model (layers, services, entry points, stack) that becomes *input context* for Stages 6–10, not merely a display artifact.

**Hallucination guard:** every architectural claim must cite the specific config/folder/manifest evidence it's derived from — this agent gets no exemption from the evidence rule just because its output reads as descriptive rather than evaluative.

### 3.6 Stage 6 — Feature Extraction Agent

The highest hallucination-risk stage in the pipeline; treat any proposed change here with proportionally more scrutiny than other stages.

**Input:** Stage 5's architecture model + Stage 4 retrieval. **Process:** two independent extraction passes — (a) *claimed capabilities*, from README/docs/docstrings/issue titles, treated as hypotheses, never fact; (b) *actual capabilities*, from the Knowledge/Repository Graph and targeted retrieval, independent of any prose. The two passes are diffed into four Finding categories: verified, doc-ahead-of-code, code-ahead-of-docs, ambiguous.

**Hallucination guard (non-negotiable, see `PRD.md` §12 and `RULES.md`):** any Finding asserting an *absence* ("no Policy Reader implementation exists") must be backed by a logged, tool-called `search_repository(query)` call — both a keyword pass and a semantic pass — with the raw result (including a zero hit count) attached as evidence. A zero-hit result on both passes is what licenses an absence claim. Any nonzero hit on either pass drops the Finding to `ambiguous` and surfaces the candidate instead of asserting absence. The agent must call the tool; it may never assert absence from model memory alone.

### 3.7 Stage 7 — Dependency Agent

**Input:** Stage 6 feature list. **Output:** three explicit relation types per feature, each its own Finding with its own evidence and confidence (not shared with the feature Finding it connects): **Depends On** (structural/conceptual requirement, independent of current status), **Blocked By** (the subset of Depends On where the required feature is missing or doc-ahead-of-code — this is what renders as a warning), **Blocks** (the inverse, computed by deterministic graph traversal over Blocked By edges — no LLM call, this part is cheap and exact).

### 3.8 Stage 8 — Debt Agent

**Input:** Stage 6, runs in parallel with Stage 7 (both depend only on Stage 6, not on each other). **Output:** `debt` Findings from TODO/FIXME extraction, test-coverage proxy (test-file-to-code ratio), dependency staleness, CI presence, and code-smell heuristics.

Note the rename from Design Proposal v2's "Debt & Health Agent": this stage produces debt Findings only. Repository Maturity/Health is a serving-layer aggregate computed across *multiple* stages' Findings, not one agent's output — see `DECISIONS.md` ADR-011 for why conflating the two was a v2 inconsistency and how it's resolved here.

### 3.9 Stage 9 — Repository Reasoning Agent

The core of the product — see `PRD.md` §7 and Design Proposal v2 §5. **Input:** Stage 6, 7, 8 Findings *as structured objects*, never raw code and never another agent's prose — this is what guarantees every Reasoning Finding has a traceable evidence chain beneath it; the agent physically cannot introduce an unfounded claim because it has no raw-code channel to invent one from.

**Output:** narrative synthesis Findings in Staff-Engineer register (the worked "Coverage Validation... blocked... 94% confidence" example from Design Proposal v2 §4 is produced here) plus the cross-Finding consistency check — diffing its own conclusions against Stage 6/7/8 outputs, populating `contradicts[]`, and triggering either a bounded re-run of the disagreeing stage or a downgrade to `ambiguous`.

### 3.10 Stage 10 — Roadmap Agent

**Input:** Stage 9 Findings only — strict layering; this agent never reaches back to Stage 6/7/8 directly, which is what keeps the roadmap consistent with everything else the product displays. **Output:** `roadmap_item` Findings, sequenced by dependency order and blast radius, each with a complexity/time estimate.

### 3.11 Stage 11 — Prompt Generation Agent

**Not part of the scheduled pipeline run** — triggered synchronously by a user action. **Input:** a selected Finding (usually `roadmap_item`) plus a fresh, narrowly-scoped retrieval pass for execution detail (existing conventions, reusable middleware, files explicitly not to touch). **Output:** prompt text, with a UI-visible disclosure of exactly which files/conventions were pulled into context.

This agent's job is deliberately smaller than it might appear from its product prominence: the "what and why" is inherited wholesale from the Finding it's rendering. Its actual contribution is "how, concretely, in this codebase's idiom" — see `PRD.md` §15.

## 4. Repository Ingestion & the Tree-sitter Pipeline

Ingestion begins with a shallow clone (full history fetched separately and only for commit mining, not for the AST pass). Language and file classification excludes generated/vendored paths (`node_modules`, `dist`, `.venv`, lockfiles) before any parsing begins — this exclusion list is itself versioned and reviewable, since a wrong exclusion silently blinds the whole pipeline to real code.

Each source file is parsed with the language-appropriate Tree-sitter grammar into a full AST, from which we extract: function/class/method signatures (name, parameters, return type where statically evident), import/export statements, and structural nesting (which class a method belongs to, which module a function belongs to). This is a facts-extraction pass only — no interpretation happens here; interpretation is Stage 5+'s job. Initial language support: Python, TypeScript/JavaScript, Go — chosen because they cover the stated tech stack and the two repositories (ClaimSight India, HyperOne) this will be dogfooded against; additional grammars are added on demand, each shipping with its own eval-set coverage before being marked "supported" rather than "heuristic fallback."

## 5. Knowledge Graph vs. Repository Graph

These are two distinct artifacts at two distinct resolutions, and the distinction is load-bearing for the product (it's also what the Architecture Graph view and the Feature Dependency Graph view render, respectively — they must never be visually conflated in the frontend, see `RULES.md` §UI Consistency).

**Knowledge Graph** — symbol-level, deterministic, exact. Nodes: functions, classes, modules. Edges: imports, calls, references. This answers "what calls what."

**Repository Graph** — module/service-level, deterministic-plus-heuristic, coarser. Nodes: services, modules, layers. Edges: structural dependency, inferred from Knowledge Graph rollup plus folder/config conventions. This answers "what architectural component depends on what."

Both live in Postgres as adjacency tables (`graph_nodes`, `graph_edges`, discriminated by a `graph_type` column), not a dedicated graph database — see `DECISIONS.md` ADR-003.

## 6. Feature Extraction & the Dependency Graph

Covered in depth in §3.6–3.7. The engineering point worth restating here: the Dependency Graph is a *conceptual* graph over Findings (Stage 7 output), entirely separate from the Repository Graph (Stage 3, structural). A feature can have zero structural (import/call) coupling to another feature in the Knowledge Graph and still have a real Blocked-By relationship in the Dependency Graph — e.g., `coverage_validator.py` doesn't import a nonexistent `policy_reader.py`, but it structurally expects a `PolicyData` type that nothing produces. The Dependency Agent's job is specifically to catch this class of gap, which no purely structural analysis (however deep) can find on its own.

## 7. Repository Reasoning & Roadmap Generation

Detailed in §3.9–3.10. One additional engineering note: the consistency check in Stage 9 is not optional or best-effort — it is a required step with a defined output contract (either `no_contradiction`, `contradiction_resolved_by_rerun`, or `contradiction_downgraded_to_ambiguous`), logged per snapshot, and is itself a metric tracked in observability (§16) — a rising contradiction rate on a given repository is an early signal that upstream stages are producing low-quality Findings for that repository's specific shape, before it shows up as a wrong user-facing claim.

### 7.1–7.3 (Feature Coverage, Documentation Coverage, Technical Debt)

Computed as weighted aggregates over `feature_status` and `debt` Findings respectively, at the serving layer — not produced by any single agent. See `RULES.md` §Confidence Conventions for the exact weighting inputs.

### 7.4 Architecture / Understanding Confidence

**This is not a component of Repository Maturity.** This was a real inconsistency in Design Proposal v2 §8, which listed it as a fourth averaged-in component alongside three genuine quality metrics — see `DECISIONS.md` ADR-011 for the full writeup. Architecture Confidence measures Blueprint's own epistemic confidence in its model of a repository (how much of Stage 3/5 resolved with high-confidence evidence vs. fell back to heuristics); it answers "how much should you trust everything else shown here," a different axis from "how good is this repository." Averaging an epistemic-confidence signal into a quality score means a codebase Blueprint merely understands poorly would score as immature even if it's excellent — a real, user-facing correctness bug had it shipped as designed. Resolution: Architecture/Understanding Confidence is displayed as a separate reliability badge alongside the Maturity score, never folded into it.

## 8. Prompt Generation Pipeline

See §3.11. Constraint assembly step worth calling out explicitly at the architecture level: before composing the prompt, the pipeline checks the target feature's unmet Blocked-By edges (Stage 7 output) and, if any exist, annotates the generated prompt with that fact rather than silently generating a prompt that ignores a known blocker — this is a direct, mechanical reuse of the Dependency Graph rather than a re-derivation, and it's the kind of cross-stage reuse that should be the default instinct when implementing new capabilities: check whether an existing Finding type already answers part of the question before adding new reasoning.

## 9. Caching & Incremental Indexing

Every pipeline stage is cached keyed on a hash of its *inputs*: file content hashes for Stages 1–4; the specific set of upstream Finding IDs plus their content hashes for Stages 5–11. A re-sync where a single file changed re-runs Stage 1–4 for that file, re-runs any Stage 5+ agent whose input Finding set actually changed as a result, and reuses everything else verbatim.

This is the same blast-radius graph traversal the product exposes to users as the Dependency Graph feature (§6), reused internally as the pipeline's own invalidation strategy: "what does this change affect" is computed once, as one algorithm, and used both to render the user-facing Blocks view and to scope the pipeline's own recomputation. Implement it once, in a shared module, not twice.

MVP ships with full re-index only (see `PRD.md` §15); this caching design is specified now because it is the first v1.1 investment (§16) and retrofitting content-hash keys after the fact is real, avoidable rework — the schema (§11) should support it from day one even if the recomputation logic isn't wired up until v1.1.

## 10. Embedding Strategy

Chunking at function/class granularity for code, section granularity for docs (§3.4) — never fixed-token windows. Embedding model: routed via OpenRouter, model choice left open pending an early accuracy/cost comparison rather than fixed in this document (see `DECISIONS.md` for how model-choice ADRs get recorded once that comparison happens). Retrieval is always hybrid (vector + keyword + graph-neighbor expansion, §3.4) — no stage is permitted to use pure vector similarity as its only retrieval mechanism, since that's a known source of missed structurally-relevant matches.

## 11. Database Schema

PostgreSQL, pgvector extension. This is the v2-corrected schema — see `DECISIONS.md` ADR-005 and ADR-011 for the reasoning behind the consolidation into `findings` and the removal of `health_scores`.

`users` — id, github_id, email, name, created_at.

`installations` — id, user_id, provider, external_id, account_login, account_type (user/organization), status (active/revoked), created_at, updated_at. Not in this document's original schema — added by `DECISIONS.md` ADR-024 during PR3 (GitHub App auth): minting a GitHub App installation access token requires an installation ID, and nothing in the original schema recorded which installation a connected repository belongs to. `provider` is deliberately not assumed to be `"github"` (`DECISIONS.md` ADR-023's provider abstraction); `account_type` exists so organization-owned installations are representable now, ahead of any org-specific UI.

`repositories` — id, user_id, installation_id (FK to `installations.id`, ADR-024 — required, since every connected repository has exactly one owning installation), github_repo_id, full_name, default_branch, private, last_synced_sha, last_synced_at, connection_status.

`repo_snapshots` — id, repository_id, commit_sha, created_at, status (indexing/ready/failed). Every downstream table hangs off a snapshot; snapshots are immutable and historical (§2).

`files` — id, snapshot_id, path, language, loc, is_generated, content_hash, structural_confidence (full/low, per §4's fallback handling).

`code_chunks` — id, file_id, symbol_name, symbol_type, start_line, end_line, embedding (vector), content_hash, content (text — the chunk's source slice; DECISIONS.md ADR-020, matching `doc_chunks.content` so retrieval is self-contained in Postgres rather than depending on a live repo checkout being available).

`doc_chunks` — id, snapshot_id, source_path, section_title, content, embedding (vector).

`graph_nodes` — id, snapshot_id, graph_type (knowledge/repository), node_type, label, metadata (jsonb), file_id (nullable FK to `files.id` — DECISIONS.md ADR-019; populated for Knowledge Graph nodes, which map 1:1 to a file, null for Repository Graph nodes, which roll up many).

`graph_edges` — id, snapshot_id, graph_type, source_node_id, target_node_id, edge_type, file_id (nullable FK to `files.id`, ADR-019 — the source node's file, i.e. the file whose parse produced the edge; null for Repository Graph edges).

`findings` — id, snapshot_id, type (doc_mismatch/missing_dependency/debt/architecture_note/feature_status/roadmap_item/prompt), statement, evidence (jsonb array of {source_type, path/symbol/commit/issue_id, excerpt, verified}), reasoning, confidence (int, computed per `RULES.md`), affected_modules (jsonb), blocked_features (jsonb), impact, produced_by (agent/stage id), created_at, supersedes (nullable FK, per §2's immutability rule).

`finding_relations` — id, from_finding_id, to_finding_id, relation_type (contradicts/built_from/depends_on/blocked_by/blocks) — this single table replaces v1's separate `feature_dependencies` table; a dependency relation is just a `finding_relations` row between two `feature_status` Findings.

`commits` — id, repository_id, sha, author, message, committed_at, files_changed (jsonb), insertions, deletions.

`issues` — id, repository_id, github_issue_id, title, body, state, labels (jsonb), embedding (vector).

`maturity_scores` — id, snapshot_id, overall_score, feature_coverage_score, documentation_coverage_score, technical_debt_score, computed_at. (Three components, not four — see §7.4.)

`understanding_confidence` — id, snapshot_id, score, low_confidence_files (jsonb), heuristic_override_count, computed_at. (Separate table, deliberately not folded into `maturity_scores` — see §7.4 / ADR-011.)

`prompt_generations` — id, snapshot_id, user_id, source_finding_id, input_request (nullable, for free-text requests), generated_prompt, context_disclosure (jsonb — what was pulled in), created_at.

Indexes: HNSW on all `embedding` columns; btree on foreign keys and `(repository_id, committed_at)`; a partial index on `findings(snapshot_id, type)` since per-type Finding queries dominate the read path.

## 12. API Structure

FastAPI, versioned under `/api/v1`. Representative surface:

`GET /auth/login`, `GET /auth/callback` — GitHub OAuth login (`DECISIONS.md` ADR-024); issues Blueprint's own short-lived session JWT as an httpOnly cookie, never the GitHub user token itself.
`GET /auth/me`, `POST /auth/logout` — current-session introspection and session termination.
`GET /auth/github/install`, `GET /auth/github/install/callback` — GitHub App installation flow; the callback persists an `installations` row and never itself fetches repository content.
`GET /repos/available?installation_id=` — repositories one installation grants access to, via the `RepositoryProvider` abstraction (`DECISIONS.md` ADR-023), never a direct GitHub call from this layer.
`POST /repos/connect`, `GET /repos`, `GET /repos/{id}` — connection and listing.
`POST /repos/{id}/sync` — trigger a pipeline run (manual in MVP).
`GET /repos/{id}/snapshots/{snapshot_id}/findings?type=` — the core read endpoint; almost every UI surface is a filtered view over this.
`GET /repos/{id}/snapshots/{snapshot_id}/architecture-graph` — Repository Graph nodes/edges.
`GET /repos/{id}/snapshots/{snapshot_id}/dependency-graph` — Dependency Findings + relations, blast radius precomputed.
`GET /repos/{id}/snapshots/{snapshot_id}/maturity` — `maturity_scores` + `understanding_confidence`, returned as two distinct objects, never merged server-side (enforcing ADR-011 at the API boundary, not just in the frontend).
`GET /repos/{id}/timeline` — cross-snapshot history.
`POST /repos/{id}/generate-prompt` — body `{ finding_id | custom_request }`, the one endpoint that does live agent work (Stage 11) in the request path.
`GET /repos/{id}/prompts` — prompt generation history.

Auth: GitHub OAuth for login, short-lived JWT for API sessions, GitHub App installation tokens (scoped, revocable) for repo access — never long-lived PATs.

## 13. Background Jobs & Worker Architecture

FastAPI handles requests; a separate worker process (same codebase, different entrypoint) consumes jobs from a Redis-backed queue for ingestion and pipeline runs — RQ, chosen over Celery for this job volume and team-of-one operational simplicity (see `DECISIONS.md`). LangGraph pipeline execution happens exclusively in the worker, never inline in a request handler, with the sole exception of Stage 11 (§3.11), which is intentionally light enough to run synchronously within a request's latency budget (§`PRD.md` §10: under 15 seconds).

The pipeline package (`pipeline/`) is fully decoupled from FastAPI — importable and runnable standalone via CLI for local development and, later, the v2+ `blueprint scan .` CLI (`PRD.md` §16) reuses it directly without modification.

## 14. Authentication & GitHub Integration

GitHub App (not OAuth-scoped PATs), minimum permission set: contents (read), metadata (read), issues (read), pull requests (read). Per-installation revocability. Webhook payloads verified via GitHub's signing secret before any job is enqueued from one (v1.1+ — no webhook receiver exists yet; installation revocation is detected lazily today, see below). Implemented in PR3; `DECISIONS.md` ADR-023 (provider abstraction) and ADR-024 (this design) record the reasoning.

**Login (identity).** `GET /auth/login` redirects to GitHub's OAuth authorize URL with a signed, short-lived `state` JWT (`purpose=login`, no server-side session store — the JWT itself is the CSRF defense). `GET /auth/callback` verifies `state`, exchanges `code` for a GitHub user access token via `integrations/github/oauth.py`, fetches the GitHub profile, upserts a `users` row, mints Blueprint's own session JWT, sets it as an httpOnly cookie, and **discards the GitHub user token immediately** — it is never persisted, never touches the database, and exists only for the duration of the callback request.

**Installation (repository access grant).** `GET /auth/github/install` (session-authenticated) redirects to `https://github.com/apps/{slug}/installations/new` with a `state` JWT (`purpose=install`, `subject=user_id`). `GET /auth/github/install/callback` verifies `state`, handles `setup_action=install` (persists an `installations` row via `services/installation_service.upsert_installation`) and `setup_action=request` (organization-owner-approval-pending — no row yet, redirects with `install=pending`) distinctly. An installation's GitHub App private key never leaves the server process; it is read once from `GITHUB_APP_PRIVATE_KEY` at startup (`integrations/github/config.py`).

**Token lifecycle.** Three token types, none persisted long-lived: (1) the App JWT (RS256, signed with the App's private key, ≤10 minutes, `integrations/github/app_jwt.py`) — used only to mint installation tokens, never to call the GitHub API directly; (2) installation access tokens (minted on demand via the App JWT, ~1 hour TTL, GitHub-imposed) — cached in-process only (`integrations/github/installation_tokens.InstallationTokenCache`), keyed by installation ID, refreshed a safety margin before expiry, never written to the database or a cookie; (3) Blueprint's own session JWT (HS256, `config.Settings.jwt_secret`) — the only credential a browser ever holds, scoped to `user_id`, short-lived, carried as an httpOnly cookie. The GitHub user OAuth token (login flow) is never cached at all — see above.

**Repository connection lifecycle.** `GET /repos/available?installation_id=` lists repositories the installation can see, via `RepositoryProvider.list_repositories()` (§ below) — a live GitHub call through a fresh installation token, never a cached repository list. `POST /repos/connect` verifies the installation belongs to the calling user, verifies the repository is actually visible to that installation (re-checked against GitHub, not trusted from client input), and inserts a `repositories` row (`connection_status`, `installation_id` FK). Disconnection/re-sync/pipeline triggering (`POST /repos/{id}/sync`) is unchanged from §13 and out of scope for this PR.

**Provider abstraction.** `services/` never imports `integrations.github.*` for repository access — only `integrations.repository.base.RepositoryProvider` (a `typing.Protocol`: `get_installation`, `list_repositories`, `get_repository`, `get_clone_credentials`), with `GitHubRepositoryProvider` as the sole MVP implementation and `integrations/repository/registry.py` as the only place a concrete provider class is named. Login/OAuth remains GitHub-specific by design (ADR-023) — there is no stated multi-provider requirement for identity, only for repository hosting.

**Error handling.** Every GitHub-specific failure mode maps to a typed exception (`integrations/github/exceptions.py`) and a stable HTTP status via `api/errors.py`'s registered handlers: missing/revoked installation → 404/403, expired or invalid `state` → 400, insufficient permissions → 403, GitHub rate limiting → 429, upstream GitHub errors → 502. None of these are bare `except Exception` catches — each is a distinct, intentional class so an unrelated bug elsewhere can't be silently reinterpreted as one of these conditions.

**Known gaps, flagged not silent (`DECISIONS.md` ADR-024):** installation revocation is detected lazily, on the next API call that needs that installation's token, not via webhook (webhook receiver is v1.1+, per above). Tenant isolation is application-layer `user_id`/`installation_id` filtering only, not Postgres RLS (`PRD.md` §90, `ARCHITECTURE.md` §17) — a known, deliberately deferred hardening pass, not an oversight.

## 15. Frontend Architecture

Next.js (App Router), TypeScript, TailwindCSS, Framer Motion. Server Components for data-heavy, mostly-static views (the document-style Repository Intelligence View, §16 of Design Proposal v2); Client Components scoped tightly to genuinely interactive pieces (the Repository Graph and Dependency Graph renderers, the Prompt Generator's streaming output). State: server state via React Query / Next's fetch caching; local UI state (graph pan/zoom, selected node) in component state — no global store, since this is a viewer over a backend-computed model, not an app with complex client-side business logic.

The Finding card is the single reusable component underlying every surface — feature status, debt items, dependency explanations, roadmap entries all render through it (see `PRD.md` §7). Building five different card components for five Finding types is exactly the kind of drift `RULES.md` §UI Consistency exists to prevent.

## 16. Failure Handling, Scalability, and Observability

**Failure handling.** Every pipeline stage failure is caught at the worker level and recorded against the snapshot (`status = failed`, with the failing stage and error attached) — a failed snapshot never partially overwrites a prior good one; the previous snapshot remains the one served until a new snapshot reaches `ready`. Evidence-check failures (§2, step 2) trigger a bounded retry (default: one retry with a corrective instruction) before the whole snapshot is marked failed for that stage.

**Scalability.** Postgres+pgvector is adequate to real scale (proven well into millions of vectors) — no premature dedicated vector DB. The worker/queue split scales ingestion load horizontally, independent of API load. The Repository Graph adjacency-table approach (§5) is the one component with a known ceiling: if multi-repo cross-linking (v2, `PRD.md` §16) produces graphs large enough that recursive traversal queries degrade, that specific, measured symptom is the trigger to introduce a dedicated graph query layer — not a decision made preemptively now (`DECISIONS.md` ADR-003).

**Observability.** Every Finding records its `produced_by` stage and the snapshot it belongs to, which makes "why did the pipeline say this" answerable by direct query, not log spelunking. The eval harness (`PRD.md` §11, Design Proposal v2 §14) runs against a hand-labeled golden set (10–20 repos, including ClaimSight India and HyperOne) and tracks precision/recall on missing-feature and dependency-edge claims plus confidence calibration error over time — this is a required, scheduled job (not an ad hoc script run before a demo), and its output is what actually gets published, not a marketing claim about accuracy.

## 17. Security Considerations

Row-level security in Postgres keyed on `user_id`/`repository_id`, not application-layer filtering alone. Secrets (GitHub App private key, API keys) in a proper secrets manager, never committed or client-exposed. Explicit, documented data-retention posture for any repository content sent to an LLM provider — confirm current OpenRouter/Anthropic terms before launch copy is finalized, since these terms change and a stale claim here is a real liability. Signed webhook payload verification (§14). Rate limiting on `/sync` and `/generate-prompt` specifically, since both are the expensive-to-run paths. Standard hygiene: CSRF protection, dependency scanning on Blueprint's own codebase — ideally, eventually, via Blueprint scanning itself (`PRD.md` §16 / Design Proposal v2 §15), which is both a real security practice and a strong recursive proof point.

## 18. Folder Structure

```
blueprint/
├── apps/
│   ├── web/                     # Next.js frontend
│   │   ├── app/
│   │   │   ├── (marketing)/
│   │   │   ├── dashboard/
│   │   │   └── repo/[id]/
│   │   ├── components/
│   │   │   └── finding-card/    # the one reusable Finding renderer
│   │   ├── lib/
│   │   └── styles/
│   └── api/                     # FastAPI backend
│       ├── api/                 # route handlers (v1), thin
│       ├── services/
│       ├── pipeline/
│       │   ├── ingestion/       # Stages 1-4
│       │   ├── graph/           # Knowledge Graph + Repository Graph
│       │   └── agents/          # Stages 5-11, one module per agent
│       ├── models/
│       ├── integrations/        # GitHub client, LLM/embedding client wrappers
│       ├── eval/                # golden-set eval harness, §16
│       └── worker.py
├── packages/
│   ├── ui/                      # shared design system, incl. Finding card
│   └── shared-types/            # OpenAPI-derived, shared FE/BE
├── infra/
│   ├── docker/
│   └── railway/
├── docs/                        # this document and its siblings
└── README.md
```

## 19. Technology Choices & Tradeoffs

See `DECISIONS.md` for the full ADR log. Summary table:

| Choice | Why | Tradeoff accepted |
|---|---|---|
| Tree-sitter for AST | fast, incremental-friendly, broad language coverage | grammar quality varies per language; mitigated by structural_confidence tagging (§4) |
| Adjacency tables in Postgres, not a graph DB | one datastore, adequate at MVP scale | recursive traversal may degrade at multi-repo scale — explicit, monitored trigger to revisit (§16, ADR-003) |
| pgvector, not a dedicated vector DB | one datastore, proven to millions of vectors | none material at this scale |
| LangGraph for agent orchestration | real DAG with conditional branches (parallel Stage 7/8, retry loops on evidence-check failure) fits a graph-with-state model better than a linear chain; checkpointing gives cheap resumability | added dependency and learning surface vs. hand-rolled orchestration — accepted because the DAG structure is genuine, not decorative |
| RQ over Celery | job volume and operational simplicity fit a small team; Celery's extra features aren't needed yet | less mature ecosystem for very high job volume — revisit if/when job volume actually grows |
| Finding as single schema (§2, §11) | one evidence/confidence/provenance model instead of four ad hoc ones; one eval target; one UI component | less per-type schema flexibility — a `jsonb` field absorbs type-specific shape instead of dedicated columns, traded deliberately for consolidation |

## 20. Future Architecture

Incremental indexing wired up on top of the content-hash caching already specified in §9 (v1.1). Webhook-driven sync replacing manual sync (v1.1). A dedicated graph query layer, introduced only if the Repository Graph traversal ceiling in §16 is actually hit (v2, conditional). GraphRAG as a retrieval upgrade once multi-repo scale genuinely benefits from community-summarization over a large, densely-linked graph — not before (`PRD.md` §16). A public read-only API and CLI reusing the already-decoupled `pipeline/` package (§13) with no architectural rework required, which is the actual payoff of having kept that package FastAPI-independent from day one.
