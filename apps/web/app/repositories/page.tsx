import { redirect } from "next/navigation";
import { Reveal, StaggerList } from "@blueprint/ui";
import { RepositoryCard } from "@/components/RepositoryCard";
import { ConnectPanel } from "@/components/ConnectPanel";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { getCurrentUser, listInstallations, listRepositories } from "@/lib/api";
import { PUBLIC_API_BASE_URL } from "@/lib/config";
import { getRepositoryFacts } from "@/lib/repository-facts";

/** Repositories — every repository the architect has been given, in
 * one browsable grid, and the one place to grant it another. Reached
 * from the top pill's repository switcher and the command palette, not
 * from the dock: it's a directory, not a room. */
export default async function RepositoriesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const [repositories, installations] = await Promise.all([listRepositories(), listInstallations()]);
  const facts = await getRepositoryFacts(repositories);

  return (
    <WorkspaceShell user={user} repositories={repositories} activeNav="repositories" activeRepoId={null}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 pb-10 pt-28 xl:px-8 xl:pt-24">
        <header className="flex flex-col gap-3">
          <Reveal distance={14}>
            <p className="text-sm font-medium text-ink-500 dark:text-ink-400">Repositories</p>
          </Reveal>
          <Reveal delay={0.08} distance={24}>
            <h1
              className="max-w-2xl text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl dark:text-ink-50"
              style={{ textWrap: "balance" }}
            >
              {repositories.length > 0
                ? "Every repository I've been given."
                : "Nothing connected yet."}
            </h1>
          </Reveal>
          <Reveal delay={0.16} distance={16}>
            <p className="max-w-xl text-lg leading-relaxed text-ink-500 dark:text-ink-400">
              {repositories.length > 0
                ? "Open one to walk into its Briefing, or connect another below."
                : "Grant access to a repository and I'll start studying it as soon as it's connected."}
            </p>
          </Reveal>
        </header>

        {repositories.length > 0 ? (
          <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {repositories.map((repository) => (
              <RepositoryCard
                key={repository.id}
                repository={repository}
                facts={facts.get(repository.id)}
              />
            ))}
          </StaggerList>
        ) : null}

        <section className="flex max-w-2xl flex-col gap-5">
          <h2 className="text-sm font-semibold text-ink-500 dark:text-ink-400">
            {installations.length > 0 ? "Connect another repository" : "Get started"}
          </h2>
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
