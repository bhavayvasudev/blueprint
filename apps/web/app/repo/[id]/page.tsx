import { notFound, redirect } from "next/navigation";
import { Reveal } from "@blueprint/ui";
import { AtlasGraph } from "@/components/atlas/AtlasGraph";
import { ModuleGraph } from "@/components/architecture/ModuleGraph";
import { RepositoryStructure } from "@/components/architecture/RepositoryStructure";
import { SectionRule } from "@/components/study/SectionRule";
import { StudyProgress } from "@/components/StudyProgress";
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

/** The Atlas — the map, and only the map. Every visualization of this
 * repository's shape lives here: the architecture constellation, the
 * folder tree, and the module graph as text. Nothing executive belongs
 * on this page — the summary, the tech stack, the status, the suggested
 * improvements all live in the Briefing (PRODUCT.md room separation; the
 * brief's central fix was pulling these two rooms apart). The graph
 * leads now instead of hiding behind a "Stats for nerds" gate: this is
 * Google Maps for the codebase, so it opens on the map. Every module in
 * it is clickable, and the module index below the canvas is the same
 * information as text (RULES.md §16). */
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

  const repoShortName = repository.full_name.split("/").pop() ?? repository.full_name;

  return (
    <WorkspaceShell
      user={user}
      repositories={repositories}
      activeNav="atlas"
      activeRepoId={repository.id}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-6 pb-10 pt-28 xl:px-8 xl:pt-24">
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

          {architectureGraph ? (
            <Reveal delay={0.1} distance={20}>
              <div className="flex flex-col gap-1.5">
                <h1 className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl dark:text-ink-50">
                  {repoShortName}
                </h1>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-500 dark:text-ink-400">
                  <span>AI Repository Map</span>
                  <span aria-hidden>·</span>
                  <span>
                    Last indexed {timeAgo(architectureGraph.snapshot.created_at) ?? "just now"}
                  </span>
                  {architectureGraph.snapshot.commit_sha ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-mono">
                        {architectureGraph.snapshot.commit_sha.slice(0, 7)}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
            </Reveal>
          ) : null}
        </header>

        {architectureGraph && reading ? (
          <>
            {/* The map leads. The constellation is the hero of this room —
                deterministic orbital layout, every module clickable into
                its imports and dependents. */}
            <section className="flex flex-col gap-5">
              <SectionRule>Architecture</SectionRule>
              <Reveal delay={0.05} distance={20}>
                <AtlasGraph
                  key={focus ?? "default"}
                  modules={reading.modules}
                  keystoneId={reading.keystoneId}
                  initialFocusId={focus}
                />
              </Reveal>
            </section>

            <section className="flex flex-col gap-5">
              <SectionRule>Folder tree</SectionRule>
              <RepositoryStructure filePaths={filePaths} />
            </section>

            <section className="flex flex-col gap-5">
              <SectionRule>The same sky, as text</SectionRule>
              <ModuleGraph
                nodes={architectureGraph.repository_graph_nodes}
                edges={architectureGraph.repository_graph_edges}
              />
            </section>
          </>
        ) : latestSnapshot ? (
          <div className="flex max-w-xl flex-col gap-6">
            <h1
              className="text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
              style={{ textWrap: "balance" }}
            >
              {latestSnapshot.status === "failed"
                ? "The study failed — there is no model to walk."
                : "I'm reading this repository."}
            </h1>
            <StudyProgress repositoryId={repository.id} initialSnapshot={latestSnapshot} />
          </div>
        ) : (
          <div className="flex max-w-xl flex-col gap-4">
            <h1
              className="text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
              style={{ textWrap: "balance" }}
            >
              No model of this repository exists yet.
            </h1>
            <p className="text-lg leading-relaxed text-ink-500 dark:text-ink-400">
              Run the first study and the Atlas will draw the real structure — modules, import
              paths, and the module carrying the most weight.
            </p>
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
