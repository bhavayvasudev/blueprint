# Blueprint — Onboarding Guide

If you just joined this project, this document is designed to get you from zero to productive in about an hour. Read it in order — it's written to build up context progressively rather than as a reference to jump around in. The deeper documents (`PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `PHASES.md`, `DECISIONS.md`) are linked throughout for when you need more depth than this document gives you; you don't need to have read them first.

---

## 1. What Blueprint actually is (5 minutes)

Blueprint connects to a GitHub repository and builds a standing, evidence-backed model of what that repository actually is — as distinct from what its README claims it is. It then reasons about that model: what's missing, what's blocked, what's technical debt, and what to build next. Every single thing it tells you is a **Finding** — a claim with cited evidence, a reasoning trace, a computed confidence score, and an explicit account of what it affects.

The one sentence that matters most, and the thing every other design decision in this codebase traces back to: **Blueprint doesn't summarize repositories, it cross-examines them.** It treats a README's claims as a hypothesis to check against the actual code, not as ground truth to restate. If you remember nothing else from this document, remember that — it's the reason the pipeline has the shape it has.

Full product context: `PRD.md`.

## 2. The shape of the system (10 minutes)

Three planes: **ingestion** (clones a repo, extracts facts deterministically — no AI involved), **reasoning** (an 11-stage pipeline that turns those facts into Findings — this is where the AI lives), and **serving** (an API and frontend that read persisted Findings — no AI happens live here, except one deliberate exception).

```
GitHub -> Ingestion Worker -> Postgres (facts, graphs, embeddings, Findings) -> FastAPI -> Next.js
              |                              ^
       Tree-sitter, git log         Reasoning Pipeline (LangGraph, background)
```

Why three planes and not one monolith: indexing and reasoning are slow (minutes) and expensive (LLM calls); serving needs to be fast (the dashboard should never wait on a pipeline run). Separating them means a slow background job never blocks someone looking at a repo they already connected. Full diagram and reasoning: `ARCHITECTURE.md` §1.

## 3. How Repository Intelligence actually works (15 minutes)

This is the part worth slowing down for, because almost everything else in the codebase exists in service of it.

Eleven pipeline stages, roughly in three groups:

**Stages 1–4 are deterministic — no LLM.** Tree-sitter parses code into an AST. That AST gets compiled into a symbol-level **Knowledge Graph** ("what calls what") and a coarser module-level **Repository Graph** ("what architectural component depends on what") — these are two genuinely different graphs, not two views of one graph, and the codebase keeps them separate on purpose (see `DECISIONS.md` ADR-004 if you're curious why). Everything gets embedded for retrieval.

**Stages 5–10 are LLM agents that run in the background on every sync**, each consuming the previous stage's *structured output*, never raw code directly (past Stage 6) and never another agent's prose. This matters: it's what makes the whole system's reasoning traceable back to real evidence instead of degrading into paraphrase-of-a-paraphrase the deeper you go. The Architecture Agent builds a narrative model of the codebase's structure. The Feature Extraction Agent is the one to understand well before touching — it runs two independent passes (what the docs *claim*, what the code *actually does*) and diffs them, which is the mechanism behind Blueprint's signature "the README says X exists, but no implementation does" output. The Dependency Agent and Debt Agent run in parallel off that. The Repository Reasoning Agent synthesizes all of it into the narrative, Staff-Engineer-register Findings you'll see in the product. The Roadmap Agent sequences those into next steps.

**Stage 11 is different — it's on-demand, not scheduled.** When you click "generate a Claude prompt" on a roadmap item, this stage runs synchronously, does a small targeted retrieval pass for execution detail, and returns a prompt. It's deliberately the smallest stage in the pipeline, because by the time it runs, every hard question ("what should be built, why, what does it depend on") has already been answered upstream.

Full stage-by-stage spec, including failure handling and hallucination-prevention mechanics for each: `ARCHITECTURE.md` §3.

## 4. The one idea to internalize before writing any pipeline code (5 minutes)

**Never let an agent claim something doesn't exist without proof.** This is the highest-risk failure mode in the entire product — a confident, wrong "X is missing" is worse than no answer at all, because it's actively misleading rather than just unhelpful. Concretely: any Finding asserting absence must be backed by a logged tool call (`search_repository`) with its actual result — including a zero-hit count — attached as evidence. If you're implementing or modifying anything in Stage 6 (Feature Extraction) or anywhere else that could produce an absence claim, this rule is non-negotiable, not a style preference. See `RULES.md` §12 and `DECISIONS.md` ADR-015.

## 5. How services communicate (5 minutes)

FastAPI and the worker share one codebase and one Postgres database — they don't talk to each other over an internal API, they talk through the database and a Redis-backed job queue. The frontend never calls the pipeline directly; it only ever reads persisted Findings through FastAPI's REST endpoints, filtered by `type` and `snapshot_id`. The one synchronous exception is Prompt Generation (Stage 11), which the frontend calls and waits on directly, within a 15-second budget. Full API surface: `ARCHITECTURE.md` §12.

## 6. Where new code belongs (10 minutes)

Route handlers are thin and live in `apps/api/api/` — they validate, call a service, return. Business logic lives in `apps/api/services/`. Pipeline stages live in `apps/api/pipeline/`, one module per agent under `pipeline/agents/`, and this package must never import anything from `api/` — it needs to keep working standalone (this is intentional: it's what lets a future CLI reuse it with zero rework, see `ARCHITECTURE.md` §13). External calls (GitHub, LLM providers, embeddings) are wrapped in `apps/api/integrations/`, never called directly from elsewhere.

On the frontend: almost everything is a Server Component by default; only make something a Client Component if it genuinely needs interactivity (graph pan/zoom, streaming text) that a Server Component can't provide. Every Finding — regardless of type — renders through the one `FindingCard` component; if you find yourself building `DebtCard` or `RoadmapCard`, stop, that's the wrong direction (`RULES.md` §5).

Full folder structure: `ARCHITECTURE.md` §18.

## 7. Common pitfalls (5 minutes)

Skipping pipeline layering to grab something conveniently — e.g., letting the Roadmap Agent reach back to raw Debt Findings instead of going through the Repository Reasoning Agent's output. It'll work in a demo and quietly desync the roadmap from everything else the product shows. Don't.

Treating Architecture Confidence (now called **Understanding Confidence**) as a quality signal about the repository. It isn't — it's a signal about how much Blueprint itself understands the repository, a genuinely different axis, and it's explicitly excluded from the Repository Maturity score for that reason (`DECISIONS.md` ADR-011). Folding it back in "for simplicity" reintroduces a real correctness bug.

Building a new UI surface for a new Finding type instead of extending `FindingCard`. Building a feature whose main value is a chart or metric GitHub already shows natively — check `PRD.md` §17 first.

Setting or trusting a raw LLM-reported confidence number anywhere. Confidence is always computed from evidence count, retrieval quality, and cross-agent agreement — the LLM's own guess is one input, never the output (`RULES.md` §11).

## 8. Development workflow (5 minutes)

Trunk-based, short-lived branches named `phase-<n>/<description>`, mapped to a `PHASES.md` milestone — if what you're building doesn't map to a phase deliverable, check whether it should before starting, rather than after. Conventional Commits. Any change to a prompt, a confidence weight, or an agent's evidence requirements needs an eval-harness run referenced in the commit before merge (`RULES.md` §13, §19) — reasoning-quality changes are held to the same bar as reasoning-quality code. Architectural changes get an ADR in `DECISIONS.md` before or alongside the PR, not after. Once implementation is underway, every completed milestone updates `MEMORY.md` — see that file's own header for what "underway" means here.

## 9. Where to go next

Building a pipeline stage: read `ARCHITECTURE.md` §3 for the stage you're touching, then `RULES.md` §9–13. Building UI: `ARCHITECTURE.md` §15 and `RULES.md` §5–7, §17–18. Making an architectural change: `DECISIONS.md` for precedent, then add your own ADR. Not sure if something's in scope: `PRD.md` §4, §17, and `RULES.md` §23 (Things Never To Do) — in that order.
