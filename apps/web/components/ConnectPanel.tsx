"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AvailableRepository, Installation } from "@blueprint/shared-types";
import { Badge, Surface, Text } from "@blueprint/ui";
import { PUBLIC_API_BASE_URL } from "@/lib/config";

async function fetchAvailableRepositories(installationId: string): Promise<AvailableRepository[]> {
  const res = await fetch(
    `${PUBLIC_API_BASE_URL}/api/v1/repos/available?installation_id=${installationId}`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`Failed to list available repositories (${res.status})`);
  return (await res.json()) as AvailableRepository[];
}

async function connectRepository(installationId: string, fullName: string): Promise<void> {
  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/repos/connect`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installation_id: installationId, full_name: fullName }),
  });
  if (!res.ok) throw new Error(`Failed to connect repository (${res.status})`);
}

/** The "connect a repository" flow (PR8) — installation already exists
 * (created by the GitHub App install redirect, ARCHITECTURE.md §14); this
 * panel lists what it grants access to and lets the user pick one. A
 * genuinely interactive, user-driven sequence (fetch on selection, mutate
 * on click), so it's a Client Component fetching directly, the same
 * category of exception as the graph pan/zoom controls (RULES.md §7). */
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
  });

  const connectMutation = useMutation({
    mutationFn: (fullName: string) => connectRepository(selectedId, fullName),
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
      <div className="flex items-center justify-between gap-4">
        <Text size="sm" tone="secondary">
          Repositories visible to
        </Text>
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
      </div>

      {availableQuery.isLoading ? (
        <Text size="sm" tone="secondary">
          Loading repositories…
        </Text>
      ) : availableQuery.isError ? (
        <Text size="sm" tone="secondary">
          Couldn&apos;t load repositories for this installation.
        </Text>
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
              <button
                type="button"
                onClick={() => connectMutation.mutate(repo.full_name)}
                disabled={connectMutation.isPending}
                className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-600 disabled:opacity-50"
              >
                {connectMutation.isPending ? "Connecting…" : "Connect"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
