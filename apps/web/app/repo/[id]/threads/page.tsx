import { notFound, redirect } from "next/navigation";
import { Reveal } from "@blueprint/ui";
import { IconThreads } from "@/components/workspace/icons";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { getCurrentUser, getRepository, listRepositories } from "@/lib/api";

/** The Threads — "what am I trying to find out?" Not built yet: no
 * conversation model, no LLM wiring exists in the backend. This room
 * says so plainly rather than faking a chat surface (PRODUCT.md: "the
 * map stays honest about its own territory"). */
export default async function ThreadsPage(props: PageProps<"/repo/[id]/threads">) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const { id } = await props.params;
  const [repository, repositories] = await Promise.all([getRepository(id), listRepositories()]);
  if (!repository) {
    notFound();
  }

  return (
    <WorkspaceShell user={user} repositories={repositories} activeNav="threads" activeRepoId={repository.id}>
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-6 pb-10 pt-32 text-center xl:pt-28">
        <Reveal distance={14}>
          <span className="glass edge-light flex size-14 items-center justify-center rounded-full text-accent-600 dark:text-accent-400">
            <IconThreads className="size-6" />
          </span>
        </Reveal>
        <Reveal delay={0.1} distance={22}>
          <h1
            className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            The Threads room isn&apos;t built yet.
          </h1>
        </Reveal>
        <Reveal delay={0.2} distance={16}>
          <p className="max-w-md text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            This is meant to be where you ask a direct question about {repository.full_name} and
            get an answer traced to the file and function it came from. That reasoning layer
            doesn&apos;t exist yet — until it does, the Briefing and the Atlas are the read.
          </p>
        </Reveal>
      </div>
    </WorkspaceShell>
  );
}
