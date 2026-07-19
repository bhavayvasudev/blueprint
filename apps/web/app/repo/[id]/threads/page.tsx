import { notFound, redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { ThreadsWorkspace } from "@/components/threads/ThreadsWorkspace";
import {
  getCurrentUser,
  getRepository,
  listRepositories,
  listThreadSuggestions,
  listThreads,
} from "@/lib/api";

/** The Threads room — a conversation with the repository (PRODUCT.md §4:
 * "what am I trying to find out?"). Every answer is grounded in real
 * retrieved evidence and traced to the file and function it came from;
 * the reasoning layer is the Threads service, running a light request-path
 * retrieval + one LLM call (ARCHITECTURE.md §13's Stage-11 exception). The
 * server component loads the investigation list and starter suggestions;
 * the workspace itself is client-driven (streaming answers, live state). */
export default async function ThreadsPage(props: PageProps<"/repo/[id]/threads">) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const { id } = await props.params;
  const [repository, repositories] = await Promise.all([getRepository(id), listRepositories()]);
  if (!repository) {
    notFound();
  }

  const [threads, suggestions] = await Promise.all([
    listThreads(repository.id),
    listThreadSuggestions(repository.id),
  ]);

  return (
    <WorkspaceShell
      user={user}
      repositories={repositories}
      activeNav="threads"
      activeRepoId={repository.id}
    >
      <ThreadsWorkspace
        repository={repository}
        initialThreads={threads}
        suggestions={suggestions}
      />
    </WorkspaceShell>
  );
}
