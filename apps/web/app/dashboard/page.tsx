import Link from "next/link";
import { redirect } from "next/navigation";
import type { Repository, Snapshot } from "@blueprint/shared-types";
import { Badge, Reveal, Text } from "@blueprint/ui";
import { ConnectPanel } from "@/components/ConnectPanel";
import { SectionRule } from "@/components/study/SectionRule";
import { SyncTrigger } from "@/components/SyncTrigger";
import { BriefingRoom } from "@/components/workspace/BriefingRoom";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  getArchitectureGraph,
  getCurrentUser,
  getRepositoryStatus,
  listContributors,
  listInstallations,
  listRepositories,
  listSnapshots,
} from "@/lib/api";
import { PUBLIC_API_BASE_URL } from "@/lib/config";
import { timeAgo } from "@/lib/format";
import { analyzeGraph } from "@/lib/insights";

/** The Briefing home — the arrival point. Renders the executive read of
 * the most-recently-studied repository (the same `BriefingRoom` every
 * per-repo `/repo/[id]/briefing` uses, so the two can never drift), plus
 * the surfaces unique to the home: connecting GitHub and jumping to any
 * other repository. It answers "what is this?" for one repository and
 * "where do I go next?" for the rest — no architecture graph here, that
 * is the Atlas's room (PRODUCT.md room separation). */
export default async function BriefingPage(props: PageProps<"/dashboard">) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const searchParams = await props.searchParams;
  const [repositories, installations] = await Promise.all([
    listRepositories(),
    listInstallations(),
  ]);

  // The home briefing covers the most recently studied repository; the
  // sidebar is the way to walk into any other one.
  const repository =
    [...repositories].sort((a, b) =>
      (b.last_synced_at ?? "").localeCompare(a.last_synced_at ?? ""),
    )[0] ?? null;

  const snapshots = repository ? await listSnapshots(repository.id) : [];
  const latest = snapshots[0] ?? null;
  const readySnapshots = snapshots.filter((s) => s.status === "ready");
  const currentReady = readySnapshots[0] ?? null;
  const previousReady = readySnapshots[1] ?? null;
  const [graph, previousGraph] = repository
    ? await Promise.all([
        currentReady ? getArchitectureGraph(repository.id, currentReady.id) : null,
        previousReady ? getArchitectureGraph(repository.id, previousReady.id) : null,
      ])
    : [null, null];
  const reading = graph ? analyzeGraph(graph, previousGraph) : null;

  // Started, not awaited — `BriefingRoom` suspends each behind its own
  // skeleton so a slow GitHub never holds up the home briefing. Only
  // started when a briefing will actually render; otherwise the page
  // shows `PreStudyBriefing` and the calls would be spent rate limit.
  const hasBriefing = Boolean(repository && graph && reading && currentReady);
  const githubStatus =
    hasBriefing && repository ? getRepositoryStatus(repository.id) : Promise.resolve(null);
  const contributors =
    hasBriefing && repository ? listContributors(repository.id) : Promise.resolve(null);

  return (
    <WorkspaceShell
      user={user}
      repositories={repositories}
      activeNav="briefing"
      activeRepoId={repository?.id ?? null}
    >
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 pb-10 pt-28 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-16 xl:px-8 xl:pt-24">
        <div className="flex min-w-0 flex-col gap-14">
          {repository && graph && reading && currentReady ? (
            <BriefingRoom
              repository={repository}
              graph={graph}
              reading={reading}
              currentReady={currentReady}
              latest={latest}
              githubStatus={githubStatus}
              contributors={contributors}
            />
          ) : (
            <PreStudyBriefing repository={repository} latest={latest} />
          )}

          {/* Studying more — quiet when a briefing exists, the protagonist when none does. */}
          <section id="connect" className="flex max-w-2xl scroll-mt-28 flex-col gap-5">
            <SectionRule>
              {repositories.length > 0 ? "Study another repository" : "Give the architect something to read"}
            </SectionRule>
            {searchParams.install === "pending" ? (
              <Text size="sm" tone="secondary">
                Installation requested — waiting on organization owner approval.
              </Text>
            ) : null}
            {searchParams.installed === "1" && searchParams.repo_sync_error !== "1" ? (
              <Text size="sm" className="text-status-ready-deep dark:text-status-ready">
                GitHub connected —{" "}
                {repositories.length > 0
                  ? `${repositories.length} ${repositories.length === 1 ? "repository is" : "repositories are"} ready below.`
                  : "reading your repositories now."}
              </Text>
            ) : null}
            {searchParams.repo_sync_error === "1" ? (
              <Text size="sm" className="text-status-failed-deep dark:text-status-failed">
                GitHub is connected, but I couldn&apos;t pull your repositories just now. Use
                &ldquo;Sync from GitHub&rdquo; below to retry.
              </Text>
            ) : null}
            <ConnectPanel
              installations={installations}
              connectedFullNames={new Set(repositories.map((repo) => repo.full_name))}
            />
            <a
              href={`${PUBLIC_API_BASE_URL}/api/v1/auth/github/install`}
              className="glass edge-light inline-flex w-fit items-center rounded-full px-4 py-2 text-sm font-medium text-ink-800 transition-colors hover:text-accent-600 dark:text-ink-200 dark:hover:text-accent-400"
            >
              {installations.length > 0 ? "Grant access to more repositories" : "Connect your GitHub account"}
            </a>
          </section>
        </div>

        {repositories.length > 0 ? (
          <Reveal delay={0.14} distance={16}>
            <aside className="flex flex-col gap-8 lg:sticky lg:top-28">
              <div className="flex flex-col gap-4">
                <SectionRule>Quick actions</SectionRule>
                <div className="flex flex-col gap-1">
                  {repository ? (
                    <Link
                      href={`/repo/${repository.id}`}
                      className="rounded-lg px-2.5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-950/5 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-white/6 dark:hover:text-ink-50"
                    >
                      Open the Atlas →
                    </Link>
                  ) : null}
                  {repository && graph ? (
                    <Link
                      href={`/repo/${repository.id}/insights`}
                      className="rounded-lg px-2.5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-950/5 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-white/6 dark:hover:text-ink-50"
                    >
                      View Insights →
                    </Link>
                  ) : null}
                  <a
                    href="#connect"
                    className="rounded-lg px-2.5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-950/5 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-white/6 dark:hover:text-ink-50"
                  >
                    Study another repository →
                  </a>
                  <Link
                    href="/repositories"
                    className="rounded-lg px-2.5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-950/5 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-white/6 dark:hover:text-ink-50"
                  >
                    Browse all repositories →
                  </Link>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <SectionRule>Recent repositories</SectionRule>
                <ul className="flex flex-col gap-1">
                  {[...repositories]
                    .sort((a, b) => (b.last_synced_at ?? "").localeCompare(a.last_synced_at ?? ""))
                    .slice(0, 5)
                    .map((repo) => (
                      <li key={repo.id}>
                        <Link
                          href={`/repo/${repo.id}/briefing`}
                          className="group flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-ink-950/5 dark:hover:bg-white/6"
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-mono text-sm text-ink-800 group-hover:text-ink-950 dark:text-ink-200 dark:group-hover:text-ink-50">
                              {repo.full_name}
                            </span>
                            <span className="text-xs text-ink-400 dark:text-ink-500">
                              {repo.last_synced_at ? `synced ${timeAgo(repo.last_synced_at)}` : "never synced"}
                            </span>
                          </span>
                          <Badge tone={repo.connection_status === "connected" ? "ready" : "failed"}>
                            {repo.connection_status}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            </aside>
          </Reveal>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}

/** The Briefing before there is anything to brief — connected-unstudied,
 * mid-study, and failed-study states, each stated plainly in the
 * architect's voice, never as a fake dashboard. */
function PreStudyBriefing({
  repository,
  latest,
}: {
  repository: Repository | null;
  latest: Snapshot | null;
}) {
  if (!repository) {
    return (
      <header className="flex flex-col gap-6">
        <Reveal distance={14}>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            <span className="font-medium text-ink-950 dark:text-ink-50">The Briefing</span>
          </p>
        </Reveal>
        <Reveal delay={0.1} distance={28}>
          <h1
            className="max-w-3xl text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            Nothing to study yet.
          </h1>
        </Reveal>
        <Reveal delay={0.2} distance={18}>
          <p className="max-w-xl text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            Connect a repository below and I&apos;ll read it — every file, every import — and
            brief you here on the shape of what I find.
          </p>
        </Reveal>
      </header>
    );
  }

  // `queued` and `cancelled` are their own states, not variations on
  // "indexing" and "failed". A queued repository is not being read yet, and
  // saying it is would be a claim about work nobody has started; a
  // cancelled study is not a failure and must not be reported as one.
  const state: "queued" | "indexing" | "failed" | "cancelled" | "unstudied" =
    latest?.status === "queued"
      ? "queued"
      : latest?.status === "indexing"
        ? "indexing"
        : latest?.status === "failed"
          ? "failed"
          : latest?.status === "cancelled"
            ? "cancelled"
            : "unstudied";

  const queuedHeadline =
    latest?.queue_position != null
      ? `${repository.full_name} is queued, position #${latest.queue_position}.`
      : `${repository.full_name} is queued for study.`;

  const headline = {
    queued: queuedHeadline,
    indexing: `I'm reading ${repository.full_name} now.`,
    failed: `The study of ${repository.full_name} failed.`,
    cancelled: `The study of ${repository.full_name} was cancelled.`,
    unstudied: `${repository.full_name} is connected, unstudied.`,
  }[state];

  const body = {
    queued:
      "Every worker is busy with another repository right now. This study begins on its own the moment one frees up — nothing further is needed from you.",
    indexing:
      "Ingesting the repository, building the knowledge graph, rolling files up into modules. This page becomes your briefing the moment the study completes.",
    failed:
      "I don't present conclusions I couldn't compute — there is no read to show. Run the study again and I'll take it from the top.",
    cancelled:
      "You stopped this one before it finished, so there's nothing to brief on. Start it again whenever you want the read.",
    unstudied:
      "Run the first study and I'll come back with a considered read of its shape: what carries the weight, what's entangled, and how far to trust me.",
  }[state];

  return (
    <header className="flex flex-col gap-6">
      <Reveal distance={14}>
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm text-ink-500 dark:text-ink-400">
          <span className="font-medium text-ink-950 dark:text-ink-50">The Briefing</span>
          <span aria-hidden>·</span>
          <span className="font-mono">{repository.full_name}</span>
        </p>
      </Reveal>
      <Reveal delay={0.1} distance={28}>
        <h1
          className="max-w-3xl text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
          style={{ textWrap: "balance" }}
        >
          {headline}
        </h1>
      </Reveal>
      <Reveal delay={0.2} distance={18}>
        <p className="max-w-xl text-lg leading-relaxed text-ink-500 dark:text-ink-400">{body}</p>
      </Reveal>
      <Reveal delay={0.3} distance={12}>
        <SyncTrigger repositoryId={repository.id} initialSnapshot={latest} />
      </Reveal>
    </header>
  );
}
