import type {
  ArchitectureGraph,
  Contributors,
  Repository,
  RepositoryStatus as GitHubStatus,
  Snapshot,
} from "@blueprint/shared-types";
import { Reveal } from "@blueprint/ui";
import { Suspense } from "react";
import { ContributorsCard, ContributorsSkeleton } from "@/components/briefing/ContributorsCard";
import { DetectedCard } from "@/components/briefing/DetectedCard";
import { PresenceCard } from "@/components/briefing/PresenceCard";
import {
  RepositoryStatus,
  RepositoryStatusSkeleton,
} from "@/components/workspace/RepositoryStatus";
import { SyncTrigger } from "@/components/SyncTrigger";
import { timeAgo } from "@/lib/format";
import { buildSummary, computeHealthScore, type StudyReading } from "@/lib/insights";

/** All file paths this study saw, pulled from the module boundaries the
 * repository graph rolled them up into — the same source the Atlas draws
 * its folder tree from, so the two rooms count the same files. */
function collectFilePaths(graph: ArchitectureGraph): string[] {
  return graph.repository_graph_nodes.flatMap((node) =>
    Array.isArray(node.metadata.file_paths) ? (node.metadata.file_paths as string[]) : [],
  );
}

/** Real folder count — every distinct directory prefix across the file
 * paths, so it's counted, never estimated. */
function countFolders(filePaths: string[]): number {
  const dirs = new Set<string>();
  for (const path of filePaths) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }
  return dirs.size;
}

/** The Briefing — one screen answering exactly one question: *what did
 * Blueprint understand about this repository?*
 *
 * Five things, in the order you'd want them: a paragraph of prose, the
 * repository's real status, what the study detected, what it found
 * present versus missing, and who wrote it. That's the whole room.
 *
 * The last of those and part of the second come from GitHub rather than
 * from a study, and arrive as promises the route started but did not
 * await. Each suspends behind its own skeleton, so the prose and the
 * audit — the parts that are genuinely Blueprint's answer — paint at once
 * regardless of how slow (or rate-limited) GitHub is being.
 *
 * What used to be here and deliberately isn't any more: the project
 * structure list and main-modules grid (the Atlas is the structural room —
 * having both meant the same file counts rendered twice in two shapes), the
 * standalone "Detected API" line (now one row of the presence audit), and
 * the interpretive claim blocks, which moved to Insights where the
 * confidence breakdown that explains them already lives. None of it was
 * deleted; it was relocated to the room that owns that question, which is
 * the same move the Atlas simplification pass made. */
export function BriefingRoom({
  repository,
  graph,
  reading,
  currentReady,
  latest,
  githubStatus,
  contributors,
}: {
  repository: Repository;
  graph: ArchitectureGraph;
  reading: StudyReading;
  currentReady: Snapshot;
  latest: Snapshot | null;
  /** Started by the route, deliberately not awaited — see the note above. */
  githubStatus: Promise<GitHubStatus | null>;
  contributors: Promise<Contributors | null>;
}) {
  const filePaths = collectFilePaths(graph);
  const docAudit = graph.snapshot.doc_audit;
  const health = computeHealthScore(reading, graph, docAudit);
  const languages = (graph.snapshot.detected_stack?.languages ?? []).slice(0, 4).map((l) => l.name);
  const licenseDetected = docAudit?.present.includes("License") ?? false;
  const summary = buildSummary(
    graph.snapshot.detected_stack,
    reading,
    docAudit,
    graph.snapshot.manifest?.readme,
  ).join(" ");
  const repoShortName = repository.full_name.split("/").pop() ?? repository.full_name;

  return (
    <>
      <header className="flex flex-col gap-6">
        <Reveal distance={14}>
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm text-ink-500 dark:text-ink-400">
              <span className="font-medium text-ink-950 dark:text-ink-50">The Briefing</span>
              <span aria-hidden>·</span>
              <span className="font-mono">{repository.full_name}</span>
              <span aria-hidden>·</span>
              <span>studied {timeAgo(currentReady.created_at) ?? "just now"}</span>
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
            <SyncTrigger repositoryId={repository.id} initialSnapshot={latest} />
          </div>
        </Reveal>

        <Reveal delay={0.08} distance={20} className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl dark:text-ink-50">
            {repoShortName}
          </h1>
          <p
            id="summary"
            className="max-w-2xl scroll-mt-28 text-lg leading-relaxed text-ink-600 dark:text-ink-300"
          >
            {summary}
          </p>
        </Reveal>

        <Reveal delay={0.14} distance={14}>
          <Suspense fallback={<RepositoryStatusSkeleton />}>
            <RepositoryStatus
              repository={repository}
              github={githubStatus}
              fileCount={graph.file_count}
              folderCount={countFolders(filePaths)}
              moduleCount={reading.modules.length}
              languages={languages}
              lastIndexedIso={currentReady.created_at}
              commitSha={currentReady.commit_sha}
              healthScore={health.score}
              licenseDetected={licenseDetected}
            />
          </Suspense>
        </Reveal>
      </header>

      <Reveal delay={0.2} distance={16}>
        <DetectedCard stack={graph.snapshot.detected_stack} />
      </Reveal>

      <Reveal delay={0.26} distance={16} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PresenceCard audit={docAudit} variant="present" />
        <PresenceCard audit={docAudit} variant="missing" />
      </Reveal>

      <Reveal delay={0.32} distance={16}>
        <Suspense fallback={<ContributorsSkeleton />}>
          <ContributorsCard data={contributors} />
        </Suspense>
      </Reveal>
    </>
  );
}
