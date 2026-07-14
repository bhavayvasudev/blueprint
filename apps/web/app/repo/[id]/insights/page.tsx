import { notFound, redirect } from "next/navigation";
import { Badge, ProportionBar, Reveal, StatBlock, Surface, Text } from "@blueprint/ui";
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
import { analyzeGraph, type Confidence } from "@/lib/insights";

const CONFIDENCE_ORDER: Confidence[] = ["measured", "likely", "undetermined"];

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
              <Surface padding="md">
                <StatBlock label="Files" value={graph.file_count.toLocaleString()} />
              </Surface>
              <Surface padding="md">
                <StatBlock label="Modules" value={reading.modules.length.toLocaleString()} />
              </Surface>
              <Surface padding="md">
                <StatBlock
                  label="Imports"
                  value={graph.repository_graph_edges.length.toLocaleString()}
                  detail="dependency edges"
                />
              </Surface>
              <Surface padding="md">
                <StatBlock
                  label="Confidence"
                  value={
                    graph.file_count > 0
                      ? `${Math.round((graph.tree_sitter_status.full_confidence_files / graph.file_count) * 100)}%`
                      : "—"
                  }
                  detail={`${graph.tree_sitter_status.full_confidence_files.toLocaleString()} of ${graph.file_count.toLocaleString()} files fully parsed`}
                />
              </Surface>
            </Reveal>

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
