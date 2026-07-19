import { notFound, redirect } from "next/navigation";
import { Reveal } from "@blueprint/ui";
import { BriefingRoom } from "@/components/workspace/BriefingRoom";
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
import { analyzeGraph } from "@/lib/insights";

/** The Briefing for one specific repository — the same executive read
 * the home renders for the most-recent repository, addressed to the
 * repository you walked into. Sharing `BriefingRoom` keeps the two
 * surfaces identical; this route only owns fetching and the pre-study
 * states. */
export default async function RepoBriefingPage(props: PageProps<"/repo/[id]/briefing">) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const { id } = await props.params;
  const [repository, repositories] = await Promise.all([getRepository(id), listRepositories()]);
  if (!repository) {
    notFound();
  }

  const snapshots = await listSnapshots(id);
  const latest = snapshots[0] ?? null;
  const readySnapshots = snapshots.filter((s) => s.status === "ready");
  const currentReady = readySnapshots[0] ?? null;
  const previousReady = readySnapshots[1] ?? null;
  const [graph, previousGraph] = await Promise.all([
    currentReady ? getArchitectureGraph(id, currentReady.id) : null,
    previousReady ? getArchitectureGraph(id, previousReady.id) : null,
  ]);
  const reading = graph ? analyzeGraph(graph, previousGraph) : null;

  return (
    <WorkspaceShell
      user={user}
      repositories={repositories}
      activeNav="briefing"
      activeRepoId={repository.id}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-14 px-6 pb-10 pt-28 xl:px-8 xl:pt-24">
        {graph && reading && currentReady ? (
          <BriefingRoom
            repository={repository}
            graph={graph}
            reading={reading}
            currentReady={currentReady}
            latest={latest}
          />
        ) : latest ? (
          <div className="flex max-w-xl flex-col gap-6">
            <Reveal distance={14}>
              <h1
                className="text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
                style={{ textWrap: "balance" }}
              >
                {latest.status === "failed"
                  ? "The study failed — there's no briefing to give."
                  : `I'm reading ${repository.full_name} now.`}
              </h1>
            </Reveal>
            <StudyProgress repositoryId={repository.id} initialSnapshot={latest} />
          </div>
        ) : (
          <div className="flex max-w-xl flex-col gap-4">
            <h1
              className="text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
              style={{ textWrap: "balance" }}
            >
              {repository.full_name} is connected, unstudied.
            </h1>
            <p className="text-lg leading-relaxed text-ink-500 dark:text-ink-400">
              Run the first study and I&apos;ll brief you here on what this repository is — its
              stack, its structure, and the modules that carry the weight.
            </p>
            <Reveal delay={0.1} distance={12}>
              <SyncTrigger repositoryId={repository.id} initialSnapshot={latest} />
            </Reveal>
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
