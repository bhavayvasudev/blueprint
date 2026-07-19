// Hand-mirrored from `apps/api/api/v1/schemas.py` (ARCHITECTURE.md §12,
// §18) — field-for-field, not auto-generated yet. Becomes an
// `openapi-typescript` generation target once the API surface is large
// enough to justify the build step (see this package's original Phase 0
// placeholder note); until then, a schema change on the backend must be
// mirrored here by hand in the same PR.

export type ConnectionStatus = "connected" | "error" | "revoked";
export type AccountType = "user" | "organization";
export type SnapshotStatus = "indexing" | "ready" | "failed";
export type PipelineStage =
  | "cloning"
  | "discovering_files"
  | "detecting_stack"
  | "parsing"
  | "detecting_routes"
  | "persisting"
  | "building_knowledge_graph"
  | "building_repository_graph"
  | "auditing_docs"
  | "building_manifest"
  | "indexing_docs"
  | "indexing_code";

export interface DetectedLanguage {
  name: string;
  file_count: number;
}

export interface DetectedFramework {
  name: string;
  category: string;
  manifest_path: string;
}

export interface DetectedStack {
  languages: DetectedLanguage[];
  frameworks: DetectedFramework[];
}

export interface DetectedRoute {
  method: string;
  path: string;
  file: string;
}

export interface ApiRoutes {
  count: number;
  routes: DetectedRoute[];
}

export interface DocAudit {
  present: string[];
  missing: string[];
}

export interface User {
  id: string;
  github_id: string;
  email: string;
  name: string;
}

export interface Installation {
  id: string;
  account_login: string;
  account_type: AccountType;
}

export interface AvailableRepository {
  external_id: string;
  full_name: string;
  default_branch: string;
  private: boolean;
  html_url: string;
}

export interface Repository {
  id: string;
  installation_id: string;
  full_name: string;
  default_branch: string;
  private: boolean;
  connection_status: ConnectionStatus;
  last_synced_sha: string | null;
  last_synced_at: string | null;
}

/** Live GitHub-side facts about a repository — the numbers that change
 * while Blueprint is doing nothing, so they're read per request rather
 * than persisted against a study. Every field is reported as GitHub gave
 * it: a repository with no declared license has `license_name: null`, not
 * a stand-in string, and one with no commits yet has a null tip commit.
 * Mirrors `RepositoryStatusOut`. */
export interface RepositoryStatus {
  stars: number;
  forks: number;
  /** Accounts subscribed to notifications — GitHub's `subscribers_count`.
   * Its `watchers_count` field is a legacy alias for the star count and is
   * deliberately not what this carries. */
  watchers: number;
  /** GitHub folds open pull requests into this count and offers no
   * issues-only number on the repository endpoint; the label matches
   * GitHub's own wording rather than implying a precision it lacks. */
  open_issues: number;
  primary_language: string | null;
  license_name: string | null;
  license_spdx_id: string | null;
  default_branch: string;
  private: boolean;
  html_url: string;
  last_commit_sha: string | null;
  last_commit_at: string | null;
  last_commit_message: string | null;
  last_commit_author: string | null;
}

/** One contributor, with their real share of the commits in this
 * response. Mirrors `ContributorOut`. There is no last-contribution date:
 * GitHub's contributors endpoint doesn't carry one, and the statistics
 * endpoint that does is computed asynchronously — so the field is absent
 * rather than guessed. */
export interface Contributor {
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
  /** 0–1. A share of the *listed* contributors when `truncated` is set. */
  share: number;
}

export interface Contributors {
  contributors: Contributor[];
  total_contributions: number;
  /** The list was capped, so `share` covers the listed set rather than the
   * repository's whole history — the UI says so instead of implying
   * otherwise. */
  truncated: boolean;
}

export interface Snapshot {
  id: string;
  commit_sha: string | null;
  status: SnapshotStatus;
  created_at: string;
  current_stage: PipelineStage | null;
  stage_started_at: string | null;
  error_message: string | null;
  progress: Record<string, number> | null;
  completed_at: string | null;
  detected_stack: DetectedStack | null;
  api_routes: ApiRoutes | null;
  doc_audit: DocAudit | null;
  /** A real historical average (last up to 5 READY studies of this same
   * repository), not a fabricated countdown — null on a repository's
   * first-ever study, when there's nothing honest to estimate from. */
  estimated_total_seconds: number | null;
  /** Stage 4's real outcome — how much of the repository is actually
   * searchable. `null` means the snapshot predates repository indexing, which
   * is itself the reason Threads can't answer from it. */
  index_status: IndexStatus | null;
  /** The precomputed Repository Manifest — the study's "knowledge card".
   * Carries the verbatim README extract, which is what lets the Briefing
   * lead with what the project says it does rather than only with the shape
   * its files happen to have. `null` on snapshots predating the manifest. */
  manifest: RepositoryManifest | null;
}

/** A README parsed into canonical fields, every one a verbatim (truncated)
 * slice of the real file — `pipeline/ingestion/readme_extract.py`. A field
 * is absent rather than empty when the README had no such section. */
export interface ReadmeExtract {
  source_path: string;
  title?: string;
  description?: string;
  features?: string;
  installation?: string;
  architecture?: string;
  tech_stack?: string;
  usage?: string;
  limitations?: string;
}

/** `pipeline/ingestion/manifest.py`'s output — composed entirely from
 * detections the pipeline already ran, never inferred. */
export interface RepositoryManifest {
  full_name: string;
  name: string;
  readme: ReadmeExtract | null;
  tech_stack: { languages: string[]; frameworks: string[] };
  entrypoints: string[];
  modules: { name: string; kind: string }[];
  api_route_count: number;
  doc_audit: DocAudit | null;
}

export interface IndexStatus {
  docs_discovered: number;
  doc_chunks: number;
  code_chunks: number;
  readme_indexed: boolean;
  provider: string;
  model: string;
  /** The indexing pass hit its chunk ceiling, so coverage is real but
   * incomplete — a caveat on answers, not a failure. */
  truncated: boolean;
  /** Verbatim failure from the indexing stage, when it failed. Surfaced to
   * the user rather than swallowed: it is the difference between "this
   * repository has no answer" and "this repository was never indexed". */
  error: string | null;
}

export interface GraphNode {
  id: string;
  node_type: string;
  label: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
}

export interface LanguageStat {
  language: string;
  file_count: number;
  loc: number;
}

export interface TreeSitterStatus {
  full_confidence_files: number;
  low_confidence_files: number;
}

export interface KnowledgeGraphStatus {
  node_count: number;
  edge_count: number;
}

export interface ArchitectureGraph {
  snapshot: Snapshot;
  file_count: number;
  language_mix: LanguageStat[];
  tree_sitter_status: TreeSitterStatus;
  knowledge_graph_status: KnowledgeGraphStatus;
  repository_graph_nodes: GraphNode[];
  repository_graph_edges: GraphEdge[];
}

// --- Threads (PRODUCT.md §4: the repository-conversation room). ------------

export type ThreadStatus = "exploring" | "answered" | "needs_context" | "blocked";
export type MessageRole = "user" | "assistant";
export type MessageStatus = "streaming" | "complete" | "error";
/** What kind of repository evidence a citation resolves to. `code`/`doc`
 * carry a source excerpt; `symbol`/`file` are name-level structural
 * evidence (a Knowledge Graph symbol or a matched file path). */
export type EvidenceKind = "code" | "doc" | "symbol" | "file";

/** One resolved, clickable citation — the real slice of the repository an
 * answer was grounded in. Mirrors `EvidenceOut` on the backend. */
export interface Evidence {
  index: number;
  chunk_type: EvidenceKind;
  file_path: string | null;
  symbol_name: string | null;
  symbol_type: string | null;
  start_line: number | null;
  end_line: number | null;
  excerpt: string | null;
  sources: string[];
}

export interface ThreadMessage {
  id: string;
  role: MessageRole;
  content: string;
  evidence: Evidence[] | null;
  followups: string[] | null;
  status: MessageStatus;
  created_at: string;
}

export interface Thread {
  id: string;
  title: string;
  status: ThreadStatus;
  pinned: boolean;
  snapshot_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ThreadDetail extends Thread {
  messages: ThreadMessage[];
}

/** The Server-Sent-Event frames the `POST .../ask` stream emits. `event`
 * names the kind; the payload shape depends on it (see `use-thread-stream`).
 * These are the *real* phases of grounding — searching the graph, reading
 * matched modules, composing — not a fake typing indicator. */
export type ThreadStreamEvent =
  | { event: "phase"; data: { phase: string; label: string } }
  | { event: "evidence"; data: { evidence: Evidence[] } }
  | { event: "token"; data: { text: string } }
  | { event: "followups"; data: { questions: string[] } }
  | { event: "done"; data: { message_id: string; thread_id: string; title: string; status: ThreadStatus } }
  | { event: "error"; data: { message: string } };

// --- Global search (the ⌘K palette's data). --------------------------------

/** What a search hit *is*. Mirrors `SearchHitKind` in
 * `apps/api/services/search_service.py` — a closed vocabulary shared across
 * the boundary, so adding a kind is a deliberate two-file change rather
 * than a silent drift. */
export type SearchHitKind =
  | "file"
  | "folder"
  | "function"
  | "class"
  | "symbol"
  | "route"
  | "documentation"
  | "readme"
  | "thread";

/** One navigable result. `target` is a resolvable pointer — a repo-relative
 * path, a thread id, a `readme#section` anchor — never a URL: the frontend
 * decides where each kind goes. */
export interface SearchHit {
  kind: SearchHitKind;
  label: string;
  detail: string | null;
  target: string;
  start_line: number | null;
  end_line: number | null;
}

export interface SearchGroup {
  kind: SearchHitKind;
  label: string;
  hits: SearchHit[];
}

export interface SearchResults {
  groups: SearchGroup[];
  /** The study these results came from — null when the repository has never
   * finished one, which is why `indexed` exists separately from an empty
   * `groups`: "nothing matched" and "nothing is indexed" are different
   * answers and the palette says which. */
  snapshot_id: string | null;
  indexed: boolean;
}
