interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isFile: false, children: [] };
  for (const path of paths) {
    const parts = path.split("/");
    let cursor = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const existing = cursor.children.find((child) => child.name === part);
      if (existing) {
        cursor = existing;
        return;
      }
      const node: TreeNode = {
        name: part,
        path: parts.slice(0, index + 1).join("/"),
        isFile,
        children: [],
      };
      cursor.children.push(node);
      cursor = node;
    });
  }
  const sortChildren = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortChildren);
  };
  sortChildren(root);
  return root.children;
}

function TreeRows({ nodes, prefix }: { nodes: TreeNode[]; prefix: string }) {
  return (
    <>
      {nodes.map((node, index) => {
        const isLast = index === nodes.length - 1;
        const connector = isLast ? "└─ " : "├─ ";
        const childPrefix = prefix + (isLast ? "   " : "│  ");
        return (
          <div key={node.path}>
            <div className="whitespace-pre text-ink-700 dark:text-ink-300">
              {prefix}
              {connector}
              {node.name}
              {node.isFile ? "" : "/"}
            </div>
            {node.children.length > 0 ? <TreeRows nodes={node.children} prefix={childPrefix} /> : null}
          </div>
        );
      })}
    </>
  );
}

/** Repository Structure — a plain, real folder/file tree built from every
 * Repository Graph module's `file_paths` (Stage 3 output). This is the
 * accessibility fallback the Architecture Graph section itself needs
 * (RULES.md §16: "a non-visual equivalent — a list/table") rendered as
 * the primary view rather than a hidden alternative, since a real file
 * tree already reads naturally as text. */
export function RepositoryStructure({ filePaths }: { filePaths: string[] }) {
  const tree = buildTree(filePaths);
  return (
    <div className="overflow-x-auto rounded-lg bg-ink-50 p-4 font-mono text-xs leading-6 dark:bg-ink-900">
      <TreeRows nodes={tree} prefix="" />
    </div>
  );
}
