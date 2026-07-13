# Blueprint — Product Requirements Document

Status: Draft v1, derived from Design Proposal v2 (source of truth: `BLUEPRINT_design_doc_v2.md`).
This document defines *what* Blueprint is and *why*. See `ARCHITECTURE.md` for *how*, `PHASES.md` for *when*, `RULES.md` for *how we work*.

---

## 1. Vision

Blueprint is an AI Software Architect: a system that maintains a continuously-updated, evidence-grounded model of what a codebase actually is — as distinct from what it claims to be — and reasons from that model about what's missing, what's at risk, and what to build next.

Blueprint does not summarize repositories. It cross-examines them. Every claim it makes is a **Finding**: a statement backed by cited evidence, a reasoning trace, a computed confidence score, and an explicit account of what it affects and what it blocks. Repository Intelligence is the product. The dependency graph, the roadmap, and the Claude prompt generator are not separate features — they are three different renderings of the same underlying Findings.

## 2. Problem

Software projects accumulate context that lives only in the heads of the people who've been staring at them — what's actually finished, what's stubbed out, what the last ten commits were quietly working around, what "the obvious next thing" is. That context is expensive to reconstruct and it decays the moment the person who held it looks away.

Three specific failure modes, in priority order for this product:

**Documentation drift is invisible until it's expensive.** READMEs and docs describe an aspirational or historical state of a project, not its current one. Nobody notices "we said we built Policy Reader but never did" until Coverage Validation breaks in a way that traces back three layers.

**Planning happens without an explicit dependency model.** Teams — especially solo developers — plan the next feature from memory, not from a model of what actually blocks what, and discover the blocker mid-sprint instead of before it.

**AI-assisted coding tools are only as good as the brief they're given.** Claude Code and comparable tools execute extremely well against a sharp, context-loaded prompt and mediocrely against a vague one. Writing that sharp prompt currently requires a human who has already fully internalized the repository — which is the exact bottleneck Blueprint exists to remove.

## 3. Goals

Blueprint should be able to connect to a real repository and produce judgments a Staff Engineer reviewing that repository would independently agree with — not summaries an intern would write. Specifically: detect where documentation and implementation disagree, with evidence; build a feature dependency graph that correctly identifies blast radius when something is missing; generate a roadmap that a competent engineer would not need to reorder; and generate Claude Code prompts that require no further context-gathering before execution.

Underlying every functional goal is one non-negotiable: **every judgment Blueprint states must be traceable to evidence, and every confidence score must be computed, not asserted.** This is a product-quality goal as much as an engineering one — the product's entire value proposition collapses the first time it states something false with high confidence and no way to check why.

## 4. Non-Goals

Blueprint is not a project management tool — it does not manage tickets, sprints, or assignees. It is not a code review tool — it does not comment on style or block PRs. It is not a general-purpose chatbot over a codebase — it does not answer arbitrary free-text questions unrelated to architecture, features, dependencies, or debt (that's a RAG chat product; this is a reasoning product, a deliberately narrower and harder target). It does not replace GitHub's native commit/contribution analytics — see §17. It does not autonomously write or commit code — it generates prompts for a human (or Claude Code) to execute; execution stays a deliberate, human-triggered step, not because of a capability limit but because collapsing planning and execution into one autonomous step is a different product with a different risk profile.

## 5. User Personas

**Primary — the solo/indie technical founder.** Runs several repositories concurrently, context-switches weekly, has no team to hand tribal knowledge to. Needs fast re-orientation and an honest, evidence-backed signal of what's actually done.

**Secondary — the engineer joining an existing codebase.** Needs an architecture-first onboarding path instead of "read the README and grep around," and a map of technical debt before stepping on it.

**Secondary — the small-team tech lead.** Owns several repositories across a team and can't personally review every PR's downstream implications. Needs an early-warning system for stalled modules and dependency violations without reading every commit.

**Tertiary — the OSS maintainer.** Wants contributors to self-serve context instead of asking "where do I start" in Discussions. Needs a public, auto-updating project map.

## 6. Jobs To Be Done

When I return to a repository I haven't touched in weeks, I want to understand its real current state in minutes, so I don't have to re-read the whole codebase to remember what I was doing.

When I'm about to plan the next feature, I want to know what it actually depends on before I start, so I don't discover a blocking gap mid-implementation.

When I'm about to hand a task to Claude Code, I want a prompt that already knows my codebase's conventions and constraints, so I don't spend the first three exchanges re-explaining context I already have written down somewhere in my head.

When I'm evaluating whether a codebase's documentation can be trusted, I want to know where it diverges from the actual implementation, so I stop making decisions based on claims that are no longer true.

## 7. Core Product Principles

Evidence before assertion — no Finding ships without a citation into real repository content. Confidence is computed, not claimed — see `RULES.md` §Confidence Conventions. Deterministic first, LLM only where judgment is genuinely required — see `ARCHITECTURE.md` §Technology Choices & Tradeoffs. Uncertainty is a visible UI state, not a resolved-away implementation detail — ambiguous Findings are shown as ambiguous. The product is one thing (Repository Intelligence) rendered in different views, not several features sharing a codebase.

## 8. UX Principles

Blueprint should read like a well-written internal architecture review document with live, interactive diagrams embedded in it — not like an admin panel with tabs. It should never feel like GitHub, Jira, or a generic AI SaaS dashboard; the reference points are Linear, Raycast, Arc, Stripe, and Vercel. Every number the product shows must be one click away from its own explanation — no unexplained percentages, ever. Motion should clarify state changes (a node resolving from ambiguous to confirmed, a graph edge appearing), never decorate for its own sake.

## 9. Functional Requirements

**Repository connection.** GitHub OAuth via a GitHub App; support for public and private repositories; branch selection; manual re-sync in MVP, webhook-driven sync in v2.

**Repository Understanding.** Deterministic extraction (AST, manifests, git history) plus an LLM-synthesized architecture narrative, per `ARCHITECTURE.md` Pipeline Stages 1–5.

**Doc-vs-implementation cross-validation.** Every inferable feature is checked against both documentation claims and actual code, producing one of: verified, doc-ahead-of-code, code-ahead-of-docs, or ambiguous — see `ARCHITECTURE.md` §Feature Extraction.

**Feature Dependency Graph.** Three explicit relation types per feature — Depends On, Blocked By, Blocks — each backed by its own Finding, with deterministic blast-radius computation.

**Repository Reasoning.** Synthesis of Feature, Dependency, and Debt Findings into Staff-Engineer-register narrative Findings, including a cross-Finding consistency check.

**Roadmap generation.** Dependency-ordered, blast-radius-aware sequencing of Findings into actionable next steps, regenerated on every sync — never manually authored.

**Claude Prompt Generation.** Context-loaded, repository-aware, convention-respecting prompts generated from a selected Finding, with a visible disclosure of exactly what context was pulled in.

**Explainable metrics.** Repository Maturity and its components, per `ARCHITECTURE.md` §Finding Lifecycle and the correction documented in `DECISIONS.md` (Architecture/Understanding Confidence is *not* averaged into Maturity — see ADR-011).

## 10. Non-Functional Requirements

**Correctness over completeness.** A missing Finding is preferable to a wrong one — the system should say "ambiguous, needs review" rather than force a confident answer, which directly shapes the confidence-ceiling design in `RULES.md`.

**Latency.** Full initial index of a mid-size repository (~50k LOC) should complete in under 5 minutes; incremental re-sync after a small change should complete in under 1 minute once incremental indexing ships (v1.1+); on-demand prompt generation should return in under 15 seconds.

**Auditability.** Every Finding must be traceable end-to-end to raw evidence through its full provenance chain — no reasoning step may consume another agent's prose summary in place of its structured Findings.

**Tenant isolation.** Private repository content, embeddings, and Findings must be isolated at the database level (row-level security), not application-layer filtering alone.

**Availability of judgment, not just uptime.** The system should degrade to visibly lower confidence and heuristic fallbacks (e.g., unsupported languages, ambiguous architecture) rather than silently presenting best-effort output as high-confidence output.

## 11. Success Metrics

Primary metric, and the one that actually matters for a reasoning product: **precision and recall of the pipeline's "missing feature" and dependency-edge claims against the hand-labeled golden set** (see `ARCHITECTURE.md` §Observability Strategy and the eval harness described in Design Proposal v2 §14). This is measured, published, and tracked over time — not a vanity metric.

Secondary metrics: time-to-first-Finding on a freshly connected repository; percentage of generated prompts a user copies into an execution tool without manual editing (a strong proxy for "was this prompt actually good enough"); confidence calibration error (do 80%-confidence Findings turn out correct roughly 80% of the time when checked against the golden set).

Explicitly not a success metric at this stage: number of connected repositories, DAU, or any growth metric — this is a pre-PMF reasoning-quality project first, and optimizing for adoption metrics before reasoning quality is proven would be optimizing for the wrong thing.

## 12. Risks

**Hallucinated absence claims.** The single most damaging failure mode — a confident "X is missing" that's wrong. Mitigated architecturally (tool-called, logged negative-evidence search; two-pass agreement requirement; confidence ceilings) per Design Proposal v2 §4 and §7 — but this is a risk to actively monitor via the eval harness, not a risk considered "solved" by the architecture alone.

**Confidence miscalibration.** A computed confidence score is only trustworthy if it's actually calibrated against outcomes; without the golden-set eval loop running continuously, calibration silently drifts as the pipeline changes. Mitigation: calibration error is a tracked metric (§11), not a one-time check.

**Scope creep toward a general dashboard.** The single largest risk to this specific project's quality, given how naturally "just add a commit chart" or "just add a Kanban view" creeps in. Mitigation: `RULES.md` §Things Never To Do exists specifically to make this an explicit, checkable rule rather than a vibe.

**Unconventional repository layouts breaking the Architecture Agent.** A repo that doesn't follow common folder/service conventions can cause Stage 5 to mis-model architecture, which poisons every downstream stage. Mitigation: Architecture Confidence is tracked and surfaced (see ADR-011 in `DECISIONS.md`) precisely so this failure mode is visible rather than silently degrading output quality elsewhere.

**Cost of the reasoning pipeline at scale.** 11 pipeline stages with several LLM calls per sync is expensive if re-run in full on every push. Mitigation: content-hash-keyed caching and incremental recomputation, prioritized early in `PHASES.md` rather than deferred, specifically because this is a cost-and-latency risk, not just a nice-to-have optimization.

## 13. Competitive Analysis

GitHub Copilot, Cursor, and Claude Code operate at the scale of the current file or session — extraordinary executors with no persistent model of the project across time. Sourcegraph/Cody solve code search and navigation, not feature-level reasoning about completeness or dependency. CodeScene is the closest philosophical cousin — it mines commit history for hotspots and knowledge-loss risk — but it's metrics-and-visualization-first, not reasoning-first, and has no concept of a feature dependency graph. Swimm and Mintlify generate and maintain documentation — descriptive, not evaluative or prescriptive. Devin-style autonomous agents collapse planning and execution into one step, which is the opposite bet from Blueprint's: Blueprint stays one layer up, as the planning intelligence that makes execution agents dramatically more effective, complementary rather than competing.

## 14. Product Positioning

Blueprint is the planning and reasoning layer that sits above execution tools like Claude Code, Cursor, and Copilot — not a competitor to them. Its differentiated claim, and the one worth defending in every product decision: **it treats documentation as a hypothesis to verify against the code, not as ground truth to summarize.** No adjacent product in this category does this today.

## 15. MVP

Four superpowers, in dependency order (each genuinely gates the next, which is also the shipping order in `PHASES.md`):

1. **Repository Understanding** — deterministic extraction, architecture synthesis, and doc-vs-implementation cross-validation (Pipeline Stages 1–6).
2. **Feature & Dependency Intelligence** — the three-relation dependency graph with blast radius (Stages 7–8).
3. **AI-generated Engineering Roadmap** — dependency-ordered, evidence-backed (Stages 9–10).
4. **Context-aware Claude Prompt Generation** — Stage 11, deliberately the smallest remaining engineering lift once 1–3 exist, despite being the most externally visible feature; scope and time estimates in `PHASES.md` should not be inflated to match its marketing prominence.

Explicitly excluded from MVP: webhook-driven live sync, incremental indexing infrastructure (full re-index is acceptable for MVP; incremental is the first v1.1 investment), multi-repo portfolio views, PR-level analysis, team accounts, public API/SDK, plugin system.

## 16. Future Roadmap

v1.1: webhook-driven sync, incremental indexing keyed on content hashes (see `ARCHITECTURE.md` §Caching & Incremental Indexing).
v1.2: PR-level analysis (does this PR resolve a doc-ahead-of-code Finding?), issue-linked reasoning.
v2: multi-repo portfolio dashboard with cross-project pattern detection, team accounts, public read-only API.
v2+: CLI for local-first usage (`blueprint scan .`), plugin system for custom analyzers, GraphRAG upgrade to retrieval once multi-repo graph scale actually justifies it (not before — see `DECISIONS.md` ADR on GraphRAG deferral).

## 17. Out-of-Scope Features

Commit contribution charts, velocity graphs, and general commit analytics as standalone product surfaces — GitHub already does this adequately; commit recency/momentum is retained only as an internal signal feeding the Debt Agent, never a dedicated screen (Design Proposal v2 §10). Kanban/ticket management of any kind. Code review or PR-comment functionality. General-purpose chat over the repository unrelated to architecture/feature/dependency/debt reasoning. Autonomous code execution or commit creation on the user's behalf.
