import type { GraphEdge, GraphNode } from "@blueprint/shared-types";
import { Badge, StaggerList, Surface, Text } from "@blueprint/ui";

/** Detected Modules + Architecture Graph + Import Relationships, rendered
 * as one cohesive section — this *is* the Repository Graph (ARCHITECTURE.md
 * §5, ADR-004): nodes are modules/services, edges are the import
 * relationships Stage 3 rolled up from the Knowledge Graph. Deliberately
 * not a force-directed canvas (that's real complexity for a Phase 0 view
 * whose job is legibility, not spectacle — PRD.md §8) — each module is a
 * card naming exactly what it depends on, which is also, by construction,
 * the RULES.md §16 non-visual equivalent a force-directed graph would
 * otherwise need bolted on separately. */
export function ModuleGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const dependenciesByNode = new Map<string, GraphNode[]>();
  for (const edge of edges) {
    const target = nodesById.get(edge.target_node_id);
    if (!target) continue;
    const list = dependenciesByNode.get(edge.source_node_id) ?? [];
    list.push(target);
    dependenciesByNode.set(edge.source_node_id, list);
  }

  return (
    <StaggerList className="grid grid-cols-1 gap-3 sm:grid-cols-2" itemClassName="h-full">
      {nodes.map((node) => {
        const dependencies = dependenciesByNode.get(node.id) ?? [];
        const fileCount = Array.isArray(node.metadata.file_paths)
          ? (node.metadata.file_paths as unknown[]).length
          : 0;
        return (
          <Surface key={node.id} padding="sm" className="flex h-full flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-medium text-ink-950 dark:text-ink-50">
                {node.label}
              </span>
              <Badge tone={node.node_type === "service" ? "accent" : "neutral"}>
                {node.node_type}
              </Badge>
            </div>
            <Text size="xs" tone="secondary">
              {fileCount} {fileCount === 1 ? "file" : "files"}
            </Text>
            {dependencies.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {dependencies.map((dep) => (
                  <span
                    key={dep.id}
                    className="rounded-full bg-ink-100 px-2 py-0.5 font-mono text-xs text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                  >
                    → {dep.label}
                  </span>
                ))}
              </div>
            ) : (
              <Text size="xs" tone="secondary">
                No outgoing imports to other modules
              </Text>
            )}
          </Surface>
        );
      })}
    </StaggerList>
  );
}
