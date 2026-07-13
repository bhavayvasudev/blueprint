import type { ArchitectureGraph } from "@blueprint/shared-types";
import { StatBlock } from "@blueprint/ui";

/** Tree-sitter Status, Knowledge Graph Status, Repository Graph Status —
 * three direct counts over Phase 0 tables (services/snapshot_service.py),
 * shown as literal numbers with their source stated in `detail`, never as
 * an unexplained percentage (RULES.md §11, §18). */
export function StatusGrid({ data }: { data: ArchitectureGraph }) {
  const totalParsed = data.tree_sitter_status.full_confidence_files + data.tree_sitter_status.low_confidence_files;
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
      <StatBlock
        label="Tree-sitter status"
        value={`${data.tree_sitter_status.full_confidence_files} / ${totalParsed}`}
        detail="files parsed with full structural confidence"
      />
      <StatBlock
        label="Knowledge Graph"
        value={data.knowledge_graph_status.node_count.toLocaleString()}
        detail={`symbols · ${data.knowledge_graph_status.edge_count.toLocaleString()} import edges`}
      />
      <StatBlock
        label="Repository Graph"
        value={data.repository_graph_nodes.length}
        detail={`modules · ${data.repository_graph_edges.length} relationships`}
      />
    </div>
  );
}
