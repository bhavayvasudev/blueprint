import { redirect } from "next/navigation";
import { Heading, Text } from "@blueprint/ui";
import { ConnectPanel } from "@/components/ConnectPanel";
import { RepositoryCard } from "@/components/RepositoryCard";
import { getCurrentUser, listInstallations, listRepositories } from "@/lib/api";
import { PUBLIC_API_BASE_URL } from "@/lib/config";

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  const searchParams = await props.searchParams;
  const [repositories, installations] = await Promise.all([
    listRepositories(),
    listInstallations(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-400">
            Blueprint
          </span>
          <Heading level={1}>{user.name}&apos;s repositories</Heading>
        </div>
        <a
          href={`${PUBLIC_API_BASE_URL}/api/v1/auth/github/install`}
          className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-800 transition hover:border-accent-400 hover:text-accent-700 dark:border-ink-700 dark:text-ink-200 dark:hover:border-accent-500 dark:hover:text-accent-400"
        >
          Connect GitHub account
        </a>
      </div>

      {searchParams.install === "pending" ? (
        <Text size="sm" tone="secondary">
          Installation requested — waiting on organization owner approval.
        </Text>
      ) : null}

      <ConnectPanel
        installations={installations}
        connectedFullNames={new Set(repositories.map((repo) => repo.full_name))}
      />

      {repositories.length === 0 ? (
        <Text tone="secondary">
          No repositories connected yet. Install the GitHub App above, then choose a repository to
          connect.
        </Text>
      ) : (
        <div className="flex flex-col gap-3">
          {repositories.map((repository) => (
            <RepositoryCard key={repository.id} repository={repository} />
          ))}
        </div>
      )}
    </main>
  );
}
