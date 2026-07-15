"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AvailableRepository, Installation } from "@blueprint/shared-types";
import { Badge, Button, Surface, Text } from "@blueprint/ui";
import { PUBLIC_API_BASE_URL } from "@/lib/config";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  return new ApiError(res.status, body?.detail ?? `Request failed with status ${res.status}`);
}

async function fetchAvailableRepositories(installationId: string): Promise<AvailableRepository[]> {
  const res = await fetch(
    `${PUBLIC_API_BASE_URL}/api/v1/repos/available?installation_id=${installationId}`,
    { credentials: "include" },
  );
  if (!res.ok) throw await readError(res);
  return (await res.json()) as AvailableRepository[];
}

async function connectRepository(installationId: string, fullName: string): Promise<void> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/repos/connect`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installation_id: installationId, full_name: fullName }),
  });
  if (!res.ok) throw await readError(res);
}

async function syncFromGitHub(installationId: string): Promise<void> {
  const res = await fetch(
    `${PUBLIC_API_BASE_URL}/api/v1/repos/sync-installation?installation_id=${installationId}`,
    { method: "POST", credentials: "include" },
  );
  if (!res.ok) throw await readError(res);
}

/** Human copy per failure mode, never the same generic sentence for a
 * revoked installation as for a rate limit — the reader needs to know
 * what to actually do next (Master Prompt: "explain why"). */
function explain(error: unknown): string {
  if (error instanceof ApiError) {
    switch (true) {
      case error.status === 401:
        return "Your session expired. Sign in again to keep connecting repositories.";
      case error.status === 403:
        return "GitHub reports this installation was revoked. Reinstall the app to reconnect.";
      case error.status === 404:
        return "This installation couldn't be found — it may have been removed on GitHub's side.";
      case error.status === 429:
        return "GitHub is rate-limiting these requests. Wait a moment and retry.";
      case error.status >= 500:
        return "GitHub's API didn't respond. This is usually temporary.";
    }
  }
  return "Couldn't reach GitHub for this installation.";
}

function Diagnostics({ error }: { error: unknown }) {
  if (process.env.NODE_ENV !== "development" || !(error instanceof Error)) return null;
  return (
    <Text size="xs" tone="secondary" mono className="opacity-70">
      {error instanceof ApiError ? `${error.status} — ` : ""}
      {error.message}
    </Text>
  );
}

/** The "connect a repository" flow — installation already exists
 * (created by the GitHub App install redirect, which now auto-connects
 * every repository it grants access to). This panel covers what's left:
 * repositories granted to the installation *after* that first sync (no
 * webhook-driven sync yet), a manual "Sync from GitHub" retry, and honest
 * failure states instead of a generic "couldn't load" (Master Prompt: no
 * silent empty states, always a Retry). */
export function ConnectPanel({
  installations,
  connectedFullNames,
}: {
  installations: Installation[];
  connectedFullNames: Set<string>;
}) {
  const [selectedId, setSelectedId] = useState(installations[0]?.id ?? "");
  const router = useRouter();
  const queryClient = useQueryClient();

  const availableQuery = useQuery({
    queryKey: ["available-repositories", selectedId],
    queryFn: () => fetchAvailableRepositories(selectedId),
    enabled: selectedId !== "",
    retry: false,
  });

  const connectMutation = useMutation({
    mutationFn: (fullName: string) => connectRepository(selectedId, fullName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["available-repositories", selectedId] });
      router.refresh();
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => syncFromGitHub(selectedId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["available-repositories", selectedId] });
      router.refresh();
    },
  });

  if (installations.length === 0) {
    return null;
  }

  const candidates = (availableQuery.data ?? []).filter(
    (repo) => !connectedFullNames.has(repo.full_name),
  );

  return (
    <Surface padding="md" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text size="sm" tone="secondary">
          Repositories visible to
        </Text>
        <div className="flex items-center gap-2">
          {installations.length > 1 ? (
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="rounded-md border border-ink-200 bg-white px-2 py-1 text-sm dark:border-ink-700 dark:bg-ink-900"
            >
              {installations.map((installation) => (
                <option key={installation.id} value={installation.id}>
                  {installation.account_login}
                </option>
              ))}
            </select>
          ) : (
            <Badge tone="neutral">{installations[0]?.account_login}</Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            loading={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            Sync from GitHub
          </Button>
        </div>
      </div>

      {syncMutation.isError ? (
        <div className="flex flex-col gap-1">
          <Text size="sm" className="text-status-failed-deep dark:text-status-failed">
            {explain(syncMutation.error)}
          </Text>
          <Diagnostics error={syncMutation.error} />
        </div>
      ) : null}

      {availableQuery.isLoading ? (
        <Text size="sm" tone="secondary">
          Loading repositories…
        </Text>
      ) : availableQuery.isError ? (
        <div className="flex flex-col items-start gap-2">
          <Text size="sm" className="text-status-failed-deep dark:text-status-failed">
            {explain(availableQuery.error)}
          </Text>
          <Diagnostics error={availableQuery.error} />
          <Button variant="ghost" size="sm" onClick={() => availableQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : candidates.length === 0 ? (
        <Text size="sm" tone="secondary">
          Every repository this installation grants access to is already connected.
        </Text>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((repo) => (
            <li
              key={repo.external_id}
              className="flex items-center justify-between gap-4 rounded-lg border border-ink-100 px-3 py-2 dark:border-ink-800"
            >
              <span className="font-mono text-sm text-ink-800 dark:text-ink-200">
                {repo.full_name}
              </span>
              <Button
                variant="accent"
                size="sm"
                loading={connectMutation.isPending && connectMutation.variables === repo.full_name}
                onClick={() => connectMutation.mutate(repo.full_name)}
              >
                Connect
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
