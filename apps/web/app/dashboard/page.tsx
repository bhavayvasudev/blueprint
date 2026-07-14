import Link from "next/link";
import { redirect } from "next/navigation";
import type { Repository, Snapshot } from "@blueprint/shared-types";
import { Reveal, Text } from "@blueprint/ui";
import { ConnectPanel } from "@/components/ConnectPanel";
import { ClaimBlock } from "@/components/study/ClaimBlock";
import { MethodRows } from "@/components/study/MethodRows";
import { ProseSegments } from "@/components/study/Prose";
import { SectionRule } from "@/components/study/SectionRule";
import { SyncTrigger } from "@/components/SyncTrigger";
import { AIBriefingCard } from "@/components/workspace/AIBriefingCard";
import { GraphPreviewCard } from "@/components/workspace/GraphPreviewCard";
import { RepositoryOverviewCard } from "@/components/workspace/RepositoryOverviewCard";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  getArchitectureGraph,
  getCurrentUser,
  listInstallations,
  listRepositories,
  listSnapshots,
} from "@/lib/api";
import { PUBLIC_API_BASE_URL } from "@/lib/config";
import { timeAgo } from "@/lib/format";
import { analyzeGraph } from "@/lib/insights";

/** The Briefing — the arrival point. Not an overview, not a dashboard:
 * the architect's current read of the most recently studied repository,
 * as prose and claims (PRODUCT.md: interpretation above evidence above
 * inventory). Every claim opens into its reasoning; every module name
 * is a handle into the Atlas. */
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

  // The briefing covers the most recently studied repository; the
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
  const firstName = user.name.split(" ")[0];
  const confidencePercent =
    graph && graph.file_count > 0
      ? Math.round((graph.tree_sitter_status.full_confidence_files / graph.file_count) * 100)
      : null;
  const thesisExcerpt = reading ? reading.thesis.map((segment) => segment.text).join("") : "";

  return (
    <WorkspaceShell
      user={user}
      repositories={repositories}
      activeNav="briefing"
      activeRepoId={repository?.id ?? null}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-16 px-6 pb-10 pt-28 xl:px-8 xl:pt-24">
        {repository && graph && reading && currentReady ? (
          <>
            {/* Who is being briefed, on what, from when — the quiet context line. */}
            <header className="flex flex-col gap-6">
              <Reveal distance={10}>
                <p className="text-sm text-ink-500 dark:text-ink-400">
                  Hi, <span className="font-medium text-ink-950 dark:text-ink-50">{firstName}</span> 👋
                </p>
              </Reveal>
              <Reveal distance={14}>
                <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm text-ink-500 dark:text-ink-400">
                  <span className="font-medium text-ink-950 dark:text-ink-50">The Briefing</span>
                  <span aria-hidden>·</span>
                  <span className="font-mono">{repository.full_name}</span>
                  <span aria-hidden>·</span>
                  <span>studied {timeAgo(currentReady.created_at) ?? "just now"}</span>
                  {currentReady.commit_sha ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-mono">at {currentReady.commit_sha.slice(0, 7)}</span>
                    </>
                  ) : null}
                  {latest && latest.id !== currentReady.id ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="text-status-indexing-deep dark:text-status-indexing">
                        {latest.status === "indexing"
                          ? "a fresh study is underway"
                          : "the newest study attempt failed — this is the last good read"}
                      </span>
                    </>
                  ) : null}
                </p>
              </Reveal>

              {/* The thesis: the read of the repository, in one articulable
                  sentence. Module names inside it are handles into the Atlas. */}
              <Reveal delay={0.1} distance={28}>
                <h1
                  className="max-w-3xl text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
                  style={{ textWrap: "balance" }}
                >
                  <ProseSegments segments={reading.thesis} repositoryId={repository.id} />
                </h1>
              </Reveal>
            </header>

            <Reveal delay={0.18} distance={20} className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <GraphPreviewCard
                modules={reading.modules}
                keystoneId={reading.keystoneId}
                repositoryId={repository.id}
              />
              <RepositoryOverviewCard
                repository={repository}
                fileCount={graph.file_count}
                moduleCount={reading.modules.length}
                importCount={graph.repository_graph_edges.length}
                confidencePercent={confidencePercent}
              />
              <AIBriefingCard excerpt={thesisExcerpt} hasMore={reading.claims.length > 0} />
            </Reveal>

            <div id="the-read" className="scroll-mt-28">
              <Reveal delay={0.26} distance={18} className="flex flex-col gap-9">
                <SectionRule>The read</SectionRule>
                {reading.claims.map((claim) => (
                  <ClaimBlock key={claim.id} claim={claim} repositoryId={repository.id} />
                ))}
              </Reveal>
            </div>

            {reading.deltas ? (
              <Reveal delay={0.05} distance={18} className="flex flex-col gap-9">
                <SectionRule>Since the last study</SectionRule>
                {reading.deltas.map((claim) => (
                  <ClaimBlock key={claim.id} claim={claim} repositoryId={repository.id} />
                ))}
              </Reveal>
            ) : null}

            <div className="flex flex-col gap-5">
              <SectionRule>How I read it</SectionRule>
              <MethodRows rows={reading.method} />
              <Link
                href={`/repo/${repository.id}`}
                className="group inline-flex w-fit items-center gap-2 text-sm font-medium text-accent-600 transition-colors hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-200"
              >
                Walk the shape in the Atlas
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </div>
          </>
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

  const state: "indexing" | "failed" | "unstudied" =
    latest?.status === "indexing" ? "indexing" : latest?.status === "failed" ? "failed" : "unstudied";

  const headline = {
    indexing: `I'm reading ${repository.full_name} now.`,
    failed: `The study of ${repository.full_name} failed.`,
    unstudied: `${repository.full_name} is connected, unstudied.`,
  }[state];

  const body = {
    indexing:
      "Ingesting the repository, building the knowledge graph, rolling files up into modules. This page becomes your briefing the moment the study completes.",
    failed:
      "I don't present conclusions I couldn't compute — there is no read to show. Run the study again and I'll take it from the top.",
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
