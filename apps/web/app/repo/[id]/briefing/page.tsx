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
  getRepositoryStatus,
  listContributors,
  listRepositories,
  listSnapshots,
} from "@/lib/api";
import { analyzeGraph } from "@/lib/insights";
import { studyHeadline } from "@/lib/study-headline";

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

  // Started, deliberately not awaited: these are the only two fetches on
  // this page that leave our own infrastructure, and neither is worth
  // delaying the study readout for. `BriefingRoom` suspends each behind
  // its own skeleton (RULES.md §5 still holds — the route owns the fetch,
  // it just hands the promise down instead of the resolved value).
  // Only started when there is actually a briefing to render — a repo
  // that has never finished a study renders the pre-study states below,
  // and spending rate limit on a page that won't show the answer is
  // waste, not eagerness.
  const hasBriefing = Boolean(graph && reading && currentReady);
  const githubStatus = hasBriefing ? getRepositoryStatus(id) : Promise.resolve(null);
  const contributors = hasBriefing ? listContributors(id) : Promise.resolve(null);

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
            githubStatus={githubStatus}
            contributors={contributors}
          />
        ) : latest ? (
          <div className="flex max-w-xl flex-col gap-6">
            <Reveal distance={14}>
              <h1
                className="text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
                style={{ textWrap: "balance" }}
              >
                {studyHeadline(latest.status, {
                  subject: repository.full_name,
                  absent: "there's no briefing to give.",
                })}
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
