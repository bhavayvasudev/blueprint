// Hand-mirrored from `apps/api/api/v1/schemas.py` (ARCHITECTURE.md §12,
// §18) — field-for-field, not auto-generated yet. Becomes an
// `openapi-typescript` generation target once the API surface is large
// enough to justify the build step (see this package's original Phase 0
// placeholder note); until then, a schema change on the backend must be
// mirrored here by hand in the same PR.

export type ConnectionStatus = "connected" | "error" | "revoked";
export type AccountType = "user" | "organization";
export type SnapshotStatus = "indexing" | "ready" | "failed";

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

export interface Snapshot {
  id: string;
  commit_sha: string | null;
  status: SnapshotStatus;
  created_at: string;
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
