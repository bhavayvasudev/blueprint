import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, FadeIn, Heading, SectionHeading, Text } from "@blueprint/ui";
import { IntelligencePlaceholders } from "@/components/architecture/IntelligencePlaceholders";
import { LanguageMix } from "@/components/architecture/LanguageMix";
import { ModuleGraph } from "@/components/architecture/ModuleGraph";
import { RepositoryStructure } from "@/components/architecture/RepositoryStructure";
import { StatusGrid } from "@/components/architecture/StatusGrid";
import { SyncTrigger } from "@/components/SyncTrigger";
import { getArchitectureGraph, getCurrentUser, getRepository, listSnapshots } from "@/lib/api";

export default async function ArchitectureViewPage(props: PageProps<"/repo/[id]">) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const { id } = await props.params;
  const repository = await getRepository(id);
  if (!repository) {
    notFound();
  }

  const snapshots = await listSnapshots(id);
  const latestSnapshot = snapshots[0] ?? null;
  const architectureGraph =
    latestSnapshot?.status === "ready" ? await getArchitectureGraph(id, latestSnapshot.id) : null;

  const filePaths = architectureGraph
    ? architectureGraph.repository_graph_nodes.flatMap((node) =>
        Array.isArray(node.metadata.file_paths) ? (node.metadata.file_paths as string[]) : [],
      )
    : [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-12 px-6 py-16">
      <div className="flex flex-col gap-4">
        <Link href="/dashboard" className="text-sm text-ink-500 hover:text-accent-600 dark:text-ink-400">
          ← Repositories
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-400">
              Architecture View
            </span>
            <Heading level={1}>{repository.full_name}</Heading>
            <div className="flex items-center gap-2">
              <Badge tone="neutral">GitHub</Badge>
              <Text size="sm" tone="secondary">
                {repository.default_branch} · {repository.private ? "private" : "public"}
              </Text>
            </div>
          </div>
          <SyncTrigger repositoryId={repository.id} initialSnapshot={latestSnapshot} />
        </div>
      </div>

      {architectureGraph ? (
        <FadeIn className="flex flex-col gap-12">
          <section className="flex flex-col gap-4">
            <SectionHeading
              eyebrow="Indexing"
              title="Snapshot"
              description={`Commit ${architectureGraph.snapshot.commit_sha?.slice(0, 7) ?? "unknown"}, indexed ${new Date(architectureGraph.snapshot.created_at).toLocaleString()}.`}
            />
            <StatusGrid data={architectureGraph} />
          </section>

          <section className="flex flex-col gap-4">
            <SectionHeading
              title="Repository Language Mix"
              description={`${architectureGraph.file_count} source files detected across ${architectureGraph.language_mix.length} languages.`}
            />
            <LanguageMix languages={architectureGraph.language_mix} />
          </section>

          <section className="flex flex-col gap-4">
            <SectionHeading
              title="Architecture Graph"
              description="Detected modules and their import relationships, rolled up from the Knowledge Graph by manifest and folder boundaries."
            />
            <ModuleGraph
              nodes={architectureGraph.repository_graph_nodes}
              edges={architectureGraph.repository_graph_edges}
            />
          </section>

          <section className="flex flex-col gap-4">
            <SectionHeading title="Repository Structure" description="Every file, grouped by detected module." />
            <RepositoryStructure filePaths={filePaths} />
          </section>
        </FadeIn>
      ) : (
        <Text tone="secondary">
          {latestSnapshot
            ? latestSnapshot.status === "failed"
              ? "The last sync failed. Try syncing again."
              : "Indexing in progress — this section will populate once the snapshot is ready."
            : "This repository hasn't been synced yet. Sync it to see its real structure."}
        </Text>
      )}

      <section className="flex flex-col gap-4">
        <SectionHeading
          eyebrow="Repository Intelligence"
          title="Coming next"
          description="Reserved for the reasoning layers built in later phases — nothing here is generated yet."
        />
        <IntelligencePlaceholders />
      </section>
    </main>
  );
}
