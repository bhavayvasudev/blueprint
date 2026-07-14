import { notFound, redirect } from "next/navigation";
import { Reveal, Text } from "@blueprint/ui";
import { AtlasGraph } from "@/components/atlas/AtlasGraph";
import { ModuleGraph } from "@/components/architecture/ModuleGraph";
import { RepositoryStructure } from "@/components/architecture/RepositoryStructure";
import { MethodRows } from "@/components/study/MethodRows";
import { ProseSegments } from "@/components/study/Prose";
import { SectionRule } from "@/components/study/SectionRule";
import { SyncTrigger } from "@/components/SyncTrigger";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  getArchitectureGraph,
  getCurrentUser,
  getRepository,
  listRepositories,
  listSnapshots,
} from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { analyzeGraph } from "@/lib/insights";

/** The Atlas — "what is the shape of this system?" The navigable
 * structural model: the shape read first (interpretation leads), the
 * module constellation as the main event, then the same facts as text,
 * and the study's method last (inventory never leads — PRODUCT.md). */
export default async function AtlasPage(props: PageProps<"/repo/[id]">) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const focus = typeof searchParams.focus === "string" ? searchParams.focus : null;

  const [repository, repositories] = await Promise.all([getRepository(id), listRepositories()]);
  if (!repository) {
    notFound();
  }

  const snapshots = await listSnapshots(id);
  const latestSnapshot = snapshots[0] ?? null;
  const architectureGraph =
    latestSnapshot?.status === "ready" ? await getArchitectureGraph(id, latestSnapshot.id) : null;
  const reading = architectureGraph ? analyzeGraph(architectureGraph) : null;

  const filePaths = architectureGraph
    ? architectureGraph.repository_graph_nodes.flatMap((node) =>
        Array.isArray(node.metadata.file_paths) ? (node.metadata.file_paths as string[]) : [],
      )
    : [];

  return (
    <WorkspaceShell
      user={user}
      repositories={repositories}
      activeNav="atlas"
      activeRepoId={repository.id}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-14 px-6 pb-10 pt-28 xl:px-8 xl:pt-24">
        <header className="flex flex-col gap-6">
          <Reveal distance={14}>
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm text-ink-500 dark:text-ink-400">
                <span className="font-medium text-ink-950 dark:text-ink-50">The Atlas</span>
                <span aria-hidden>·</span>
                <span className="font-mono">{repository.full_name}</span>
                <span aria-hidden>·</span>
                <span>
                  {repository.default_branch} · {repository.private ? "private" : "public"}
                </span>
              </p>
              <SyncTrigger repositoryId={repository.id} initialSnapshot={latestSnapshot} />
            </div>
          </Reveal>

          {reading ? (
            <Reveal delay={0.1} distance={28}>
              <h1
                className="max-w-3xl text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
                style={{ textWrap: "balance" }}
              >
                <ProseSegments segments={reading.thesis} repositoryId={repository.id} />
              </h1>
            </Reveal>
          ) : null}
        </header>

        {architectureGraph && reading ? (
          <>
            {/* The constellation: distance from center is real graph
                distance from the load-bearing module. */}
            <Reveal delay={0.15} distance={20}>
              <AtlasGraph
                key={focus ?? "default"}
                modules={reading.modules}
                keystoneId={reading.keystoneId}
                initialFocusId={focus}
              />
            </Reveal>

            <section className="flex flex-col gap-5">
              <SectionRule>The same sky, as text</SectionRule>
              <ModuleGraph
                nodes={architectureGraph.repository_graph_nodes}
                edges={architectureGraph.repository_graph_edges}
              />
            </section>

            <section className="flex max-w-4xl flex-col gap-5">
              <SectionRule>How I read it</SectionRule>
              <Text size="sm" tone="secondary">
                Studied {timeAgo(architectureGraph.snapshot.created_at) ?? "just now"}
                {architectureGraph.snapshot.commit_sha
                  ? ` at commit ${architectureGraph.snapshot.commit_sha.slice(0, 7)}`
                  : ""}
                . Feature detection and the reasoning layers arrive in a later phase — nothing on
                this page is generated; every line above is counted.
              </Text>
              <MethodRows rows={reading.method} />
            </section>

            <section className="flex flex-col gap-5">
              <SectionRule>Every file, by module</SectionRule>
              <details className="group">
                <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink-500 transition-colors hover:text-accent-600 dark:text-ink-400 dark:hover:text-accent-400 [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Show all {filePaths.length.toLocaleString()} files</span>
                  <span className="hidden group-open:inline">Hide the file inventory</span>
                  <span aria-hidden className="text-xs transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <div className="mt-4">
                  <RepositoryStructure filePaths={filePaths} />
                </div>
              </details>
            </section>
          </>
        ) : (
          <div className="flex max-w-xl flex-col gap-4">
            <h1
              className="text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
              style={{ textWrap: "balance" }}
            >
              {latestSnapshot
                ? latestSnapshot.status === "failed"
                  ? "The study failed — there is no model to walk."
                  : "I'm still reading this repository."
                : "No model of this repository exists yet."}
            </h1>
            <p className="text-lg leading-relaxed text-ink-500 dark:text-ink-400">
              {latestSnapshot
                ? latestSnapshot.status === "failed"
                  ? "Run the study again and the Atlas will draw itself from what I find."
                  : "The Atlas draws itself the moment the study completes — no placeholder shapes in the meantime."
                : "Run the first study and the Atlas will draw the real structure — modules, import paths, and the module carrying the most weight."}
            </p>
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
