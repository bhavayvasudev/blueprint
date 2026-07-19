import { notFound, redirect } from "next/navigation";
import type { Snapshot } from "@blueprint/shared-types";
import { Badge, ProportionBar, Reveal, StatBlock, Surface, Text, Tilt } from "@blueprint/ui";
import { CountUp } from "@/components/landing/CountUp";
import { ClaimBlock } from "@/components/study/ClaimBlock";
import { ConfidenceMark } from "@/components/study/Confidence";
import { SectionRule } from "@/components/study/SectionRule";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  getArchitectureGraph,
  getCurrentUser,
  getRepository,
  listRepositories,
  listSnapshots,
} from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { analyzeGraph, type Claim, type Confidence } from "@/lib/insights";

const CONFIDENCE_ORDER: Confidence[] = ["measured", "likely", "undetermined"];

/** How far back the timeline looks — bounded so a long-lived repository
 * doesn't force a graph fetch per historical snapshot; enough studies to
 * cover "this week" for a repository synced roughly daily. */
const TIMELINE_SNAPSHOT_LIMIT = 8;

type TimelineBucket = "Today" | "Yesterday" | "This week" | "Earlier";
const BUCKET_ORDER: TimelineBucket[] = ["Today", "Yesterday", "This week", "Earlier"];

function bucketFor(iso: string): TimelineBucket {
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((startOfDay(Date.now()) - startOfDay(new Date(iso).getTime())) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "This week";
  return "Earlier";
}

/** Real structural movement between consecutive ready studies, reusing
 * `analyzeGraph`'s own delta engine (never inventing an event that
 * didn't happen) — grouped by the day the newer study ran. */
async function buildTimeline(
  repositoryId: string,
  readySnapshots: Snapshot[],
): Promise<[TimelineBucket, { snapshot: Snapshot; claim: Claim }[]][]> {
  const window = readySnapshots.slice(0, TIMELINE_SNAPSHOT_LIMIT);
  if (window.length < 2) return [];

  const graphs = await Promise.all(
    window.map((snapshot) => getArchitectureGraph(repositoryId, snapshot.id)),
  );

  const entries: { snapshot: Snapshot; claim: Claim }[] = [];
  for (let i = 0; i < graphs.length - 1; i += 1) {
    const { deltas } = analyzeGraph(graphs[i]!, graphs[i + 1]!);
    for (const claim of deltas ?? []) {
      if (claim.id === "delta-stable") continue;
      entries.push({ snapshot: window[i]!, claim });
    }
  }

  const grouped = new Map<TimelineBucket, { snapshot: Snapshot; claim: Claim }[]>();
  for (const entry of entries) {
    const bucket = bucketFor(entry.snapshot.created_at);
    grouped.set(bucket, [...(grouped.get(bucket) ?? []), entry]);
  }
  return BUCKET_ORDER.filter((bucket) => grouped.has(bucket)).map((bucket) => [
    bucket,
    grouped.get(bucket)!,
  ]);
}

/** Insights — the same study as the Briefing, read as evidence instead
 * of prose. Where the Briefing leads with a thesis and the Atlas leads
 * with shape, this room leads with the numbers behind both: real
 * counts, computed ratios, nothing estimated. It exists in service of
 * what the other two rooms already claim, not as a competing verdict —
 * every figure here traces back to the same graph. */
export default async function InsightsPage(props: PageProps<"/repo/[id]/insights">) {
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
  const latestSnapshot = snapshots[0] ?? null;
  const graph = latestSnapshot?.status === "ready" ? await getArchitectureGraph(id, latestSnapshot.id) : null;
  const reading = graph ? analyzeGraph(graph) : null;
  const readySnapshots = snapshots.filter((s) => s.status === "ready");
  const timeline = graph ? await buildTimeline(id, readySnapshots) : [];

  return (
    <WorkspaceShell user={user} repositories={repositories} activeNav="insights" activeRepoId={repository.id}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-14 px-6 pb-10 pt-28 xl:px-8 xl:pt-24">
        <header className="flex flex-col gap-6">
          <Reveal distance={14}>
            <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm text-ink-500 dark:text-ink-400">
              <span className="font-medium text-ink-950 dark:text-ink-50">Insights</span>
              <span aria-hidden>·</span>
              <span className="font-mono">{repository.full_name}</span>
            </p>
          </Reveal>
          <Reveal delay={0.08} distance={26}>
            <h1
              className="max-w-2xl text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
              style={{ textWrap: "balance" }}
            >
              The evidence behind the read.
            </h1>
          </Reveal>
        </header>

        {graph && reading ? (
          <>
            <Reveal delay={0.12} distance={18} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Tilt maxTilt={3}>
                <Surface padding="md">
                  <StatBlock label="Files" value={<CountUp value={graph.file_count} />} />
                </Surface>
              </Tilt>
              <Tilt maxTilt={3}>
                <Surface padding="md">
                  <StatBlock label="Modules" value={<CountUp value={reading.modules.length} />} />
                </Surface>
              </Tilt>
              <Tilt maxTilt={3}>
                <Surface padding="md">
                  <StatBlock
                    label="Imports"
                    value={<CountUp value={graph.repository_graph_edges.length} />}
                    detail="dependency edges"
                  />
                </Surface>
              </Tilt>
              <Tilt maxTilt={3}>
                <Surface padding="md">
                  <StatBlock
                    label="Confidence"
                    value={
                      graph.file_count > 0 ? (
                        <CountUp
                          value={Math.round(
                            (graph.tree_sitter_status.full_confidence_files / graph.file_count) * 100,
                          )}
                          suffix="%"
                        />
                      ) : (
                        "—"
                      )
                    }
                    detail={`${graph.tree_sitter_status.full_confidence_files.toLocaleString()} of ${graph.file_count.toLocaleString()} files fully parsed`}
                  />
                </Surface>
              </Tilt>
            </Reveal>

            {timeline.length > 0 ? (
              <section className="flex flex-col gap-8">
                <SectionRule>Timeline</SectionRule>
                {timeline.map(([bucket, entries]) => (
                  <div key={bucket} className="flex flex-col gap-5">
                    <h3 className="text-sm font-semibold text-ink-500 dark:text-ink-400">{bucket}</h3>
                    <div className="flex flex-col gap-6">
                      {entries.map(({ snapshot, claim }) => (
                        <div key={`${snapshot.id}-${claim.id}`} className="flex flex-col gap-1.5">
                          <span className="text-xs text-ink-400 dark:text-ink-500">
                            {timeAgo(snapshot.created_at) ?? "just now"}
                            {snapshot.commit_sha ? ` · ${snapshot.commit_sha.slice(0, 7)}` : ""}
                          </span>
                          <ClaimBlock claim={claim} repositoryId={repository.id} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ) : null}

            {graph.language_mix.length > 0 ? (
              <section className="flex flex-col gap-5">
                <SectionRule>Language mix, by file count</SectionRule>
                <Surface padding="md" className="flex flex-col gap-4">
                  {[...graph.language_mix]
                    .sort((a, b) => b.file_count - a.file_count)
                    .slice(0, 8)
                    .map((entry) => (
                      <ProportionBar
                        key={entry.language}
                        label={entry.language}
                        count={entry.file_count}
                        countLabel={`${entry.file_count.toLocaleString()} files`}
                        total={graph.file_count}
                      />
                    ))}
                </Surface>
              </section>
            ) : null}

            {/* "The read" — the interpretive claims, moved here from the
                Briefing so each claim sits next to the confidence breakdown
                that explains it, instead of standing alone in a room whose
                job is the one-paragraph summary. */}
            <section className="flex flex-col gap-9">
              <SectionRule>The read</SectionRule>
              {reading.claims.map((claim) => (
                <ClaimBlock key={claim.id} claim={claim} repositoryId={repository.id} />
              ))}
            </section>

            <section className="flex flex-col gap-5">
              <SectionRule>What the claims rest on</SectionRule>
              <Surface padding="md" className="flex flex-col gap-3">
                {CONFIDENCE_ORDER.map((level) => {
                  const count = reading.claims.filter((claim) => claim.confidence === level).length;
                  return (
                    <div key={level} className="flex items-center justify-between gap-4">
                      <ConfidenceMark confidence={level} />
                      <span className="text-sm text-ink-500 dark:text-ink-400">
                        {count} {count === 1 ? "claim" : "claims"}
                      </span>
                    </div>
                  );
                })}
              </Surface>
            </section>

            <section className="flex flex-col gap-5">
              <SectionRule>Every module, by weight</SectionRule>
              <Surface padding="md" className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">
                      <th className="pb-3 pr-4 font-medium">Module</th>
                      <th className="pb-3 pr-4 font-medium">Files</th>
                      <th className="pb-3 pr-4 font-medium">Depends on</th>
                      <th className="pb-3 font-medium">Depended on by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...reading.modules]
                      .sort((a, b) => b.fileCount - a.fileCount)
                      .map((module) => (
                        <tr key={module.id} className="border-t border-ink-950/6 dark:border-white/8">
                          <td className="py-2.5 pr-4">
                            <span className="flex items-center gap-2 font-medium text-ink-800 dark:text-ink-200">
                              {module.label}
                              {module.inCycle ? <Badge tone="failed">circular</Badge> : null}
                            </span>
                          </td>
                          <td className="py-2.5 pr-4 text-ink-600 dark:text-ink-400">{module.fileCount}</td>
                          <td className="py-2.5 pr-4 text-ink-600 dark:text-ink-400">{module.dependsOn.length}</td>
                          <td className="py-2.5 text-ink-600 dark:text-ink-400">{module.dependedOnBy.length}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </Surface>
            </section>

            <Text size="sm" tone="secondary">
              Studied {timeAgo(graph.snapshot.created_at) ?? "just now"}
              {graph.snapshot.commit_sha ? ` at commit ${graph.snapshot.commit_sha.slice(0, 7)}` : ""}.
              Every figure above is counted from the same knowledge graph the Atlas draws.
            </Text>
          </>
        ) : (
          <div className="flex max-w-xl flex-col gap-4">
            <h2 className="text-2xl font-semibold text-ink-950 dark:text-ink-50">
              {latestSnapshot
                ? latestSnapshot.status === "failed"
                  ? "The study failed — there's no evidence to show."
                  : "I'm still reading this repository."
                : "No study exists yet."}
            </h2>
            <p className="text-lg leading-relaxed text-ink-500 dark:text-ink-400">
              Insights draws itself from the same study the Atlas and the Briefing use — run it
              from either room and this page fills in automatically.
            </p>
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
