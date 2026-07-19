"use client";

import { CommandPalette, type Command, type CommandGroup } from "@blueprint/ui";
import type { Repository, SearchGroup, SearchHit, SearchHitKind } from "@blueprint/shared-types";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PUBLIC_API_BASE_URL } from "@/lib/config";
import { signOut } from "@/lib/auth-client";
import { repoDisplayName } from "@/lib/format";
import { searchRepository } from "@/lib/search-client";
import type { WorkspaceDialogKind } from "./WorkspaceShell";
import {
  IconAppearance,
  IconArchitecture,
  IconBriefing,
  IconClass,
  IconDoc,
  IconFile,
  IconFolder,
  IconFunction,
  IconGitHub,
  IconInsights,
  IconLogout,
  IconPlus,
  IconRoute,
  IconSymbol,
  IconThreads,
} from "./icons";

/** How long to wait after the last keystroke before asking the server.
 * Short enough that search feels like it's keeping up with typing, long
 * enough that a burst of keystrokes is one request rather than eight. */
const DEBOUNCE_MS = 120;

const KIND_ICON: Record<SearchHitKind, React.ReactNode> = {
  file: <IconFile className="size-4" />,
  folder: <IconFolder className="size-4" />,
  function: <IconFunction className="size-4" />,
  class: <IconClass className="size-4" />,
  symbol: <IconSymbol className="size-4" />,
  route: <IconRoute className="size-4" />,
  documentation: <IconDoc className="size-4" />,
  readme: <IconDoc className="size-4" />,
  thread: <IconThreads className="size-4" />,
};

/** Where selecting a hit actually goes.
 *
 * Every destination is a *deep link into an existing room* carrying the
 * thing you picked — never a bare room URL that leaves you to find it
 * again, which was the old palette's whole problem. `?path=`/`?symbol=`
 * are the Atlas's focus contract; `?thread=` is the Threads room's. */
function hrefFor(repositoryId: string, hit: SearchHit): string {
  const atlas = (path: string, extra?: Record<string, string>) => {
    const params = new URLSearchParams({ path, ...extra });
    return `/repo/${repositoryId}?${params.toString()}`;
  };

  switch (hit.kind) {
    case "file":
    case "folder":
    case "route":
      return atlas(hit.target);
    case "function":
    case "class":
    case "symbol":
      return atlas(hit.target, {
        symbol: hit.label.replace(/\(\)$/, ""),
        ...(hit.start_line !== null ? { line: String(hit.start_line) } : {}),
      });
    case "readme":
      // The hit's `target` is `readme#<section>`; its `detail` is the real
      // file the section came from. Open the file — the section name alone
      // isn't a place, and the Atlas can show the document itself.
      return atlas(hit.detail ?? "README.md");
    case "documentation":
      return atlas(hit.target);
    case "thread":
      return `/repo/${repositoryId}/threads?thread=${hit.target}`;
  }
}

/** The ⌘K layer: a real search over everything the latest study indexed,
 * plus the workspace's own commands.
 *
 * The two halves behave differently on purpose. Search results arrive
 * already matched by the server (`prefiltered`), so they're shown verbatim;
 * commands are matched here in the client, because they're a fixed handful
 * that never needs a round-trip. Rooms that don't exist for the current
 * context (Atlas/Insights/Threads with no active repository) simply don't
 * appear rather than appearing disabled — a palette should only offer what
 * it can actually do. */
export function WorkspaceCommandPalette({
  open,
  onClose,
  repositories,
  activeRepoId,
  onOpenDialog,
}: {
  open: boolean;
  onClose: () => void;
  repositories: Repository[];
  activeRepoId: string | null;
  onOpenDialog: (dialog: WorkspaceDialogKind) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  /** Results are stored together with the query that produced them, which
   * is what makes "is a search in flight" a *derived* fact (the displayed
   * results are for an older query) rather than a separate loading flag
   * that has to be kept in sync by hand. */
  const [answered, setAnswered] = useState<{
    query: string;
    groups: SearchGroup[];
    indexed: boolean;
    failed: boolean;
  }>({ query: "", groups: [], indexed: true, failed: false });
  const abortRef = useRef<AbortController | null>(null);

  const trimmed = query.trim();
  const searchable = activeRepoId !== null && trimmed.length > 0;
  const loading = searchable && answered.query !== trimmed;
  const results = searchable && answered.query === trimmed ? answered.groups : [];

  useEffect(() => {
    // Search is repository-scoped: with no repository in context there is
    // nothing to search *over*, and the palette is a command menu only.
    if (!activeRepoId || trimmed.length === 0) {
      abortRef.current?.abort();
      return;
    }

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      searchRepository(activeRepoId, trimmed, controller.signal)
        .then((response) =>
          setAnswered({
            query: trimmed,
            groups: response.groups,
            indexed: response.indexed,
            failed: false,
          }),
        )
        .catch((error: unknown) => {
          // An abort is this effect superseding itself, not a failure —
          // the newer request owns the state, so this one stays silent.
          if (error instanceof DOMException && error.name === "AbortError") return;
          setAnswered({ query: trimmed, groups: [], indexed: true, failed: true });
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [activeRepoId, trimmed]);

  // Abort any in-flight search when the palette closes, so a late response
  // can't repopulate a panel the user has already dismissed.
  useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);

  const searchGroups: CommandGroup[] = activeRepoId
    ? results.map((group) => ({
        label: group.label,
        prefiltered: true,
        commands: group.hits.map(
          (hit, index): Command => ({
            id: `${group.kind}-${hit.target}-${hit.start_line ?? index}`,
            label: hit.label,
            detail: hit.detail ?? undefined,
            icon: KIND_ICON[hit.kind],
            onSelect: () => router.push(hrefFor(activeRepoId, hit)),
          }),
        ),
      }))
    : [];

  const navigate: CommandGroup = {
    label: "Navigate",
    commands: [
      {
        id: "nav-briefing",
        label: "The Briefing",
        hint: "Overview",
        icon: <IconBriefing className="size-4" />,
        keywords: "home overview dashboard summary",
        onSelect: () =>
          router.push(activeRepoId ? `/repo/${activeRepoId}/briefing` : "/dashboard"),
      },
      ...(activeRepoId
        ? [
            {
              id: "nav-atlas",
              label: "The Atlas",
              hint: "Structure",
              icon: <IconArchitecture className="size-4" />,
              keywords: "graph modules structure explorer tree folders",
              onSelect: () => router.push(`/repo/${activeRepoId}`),
            },
            {
              id: "nav-insights",
              label: "Insights",
              hint: "Evidence",
              icon: <IconInsights className="size-4" />,
              keywords: "stats metrics language confidence",
              onSelect: () => router.push(`/repo/${activeRepoId}/insights`),
            },
            {
              id: "nav-threads",
              label: "The Threads",
              hint: "Ask the repo",
              icon: <IconThreads className="size-4" />,
              keywords: "chat ask question investigate conversation",
              onSelect: () => router.push(`/repo/${activeRepoId}/threads`),
            },
          ]
        : []),
      {
        id: "nav-repositories",
        label: "Browse all repositories",
        icon: <IconPlus className="size-4" />,
        keywords: "connect repos github",
        onSelect: () => router.push("/repositories"),
      },
    ],
  };

  const repos: CommandGroup = {
    label: "Repositories",
    commands: repositories.map((repository) => ({
      id: `repo-${repository.id}`,
      label: repoDisplayName(repository.full_name),
      hint: repository.id === activeRepoId ? "Current" : repository.default_branch,
      keywords: repository.full_name,
      onSelect: () => router.push(`/repo/${repository.id}`),
    })),
  };

  const account: CommandGroup = {
    label: "Account",
    commands: [
      {
        id: "account-appearance",
        label: "Appearance",
        icon: <IconAppearance className="size-4" />,
        keywords: "theme dark light",
        onSelect: () => onOpenDialog("appearance"),
      },
      {
        id: "account-github",
        label: "Manage GitHub account access",
        icon: <IconGitHub className="size-4" />,
        onSelect: () => window.open(`${PUBLIC_API_BASE_URL}/api/v1/auth/github/install`, "_blank"),
      },
      {
        id: "account-sign-out",
        label: "Sign out",
        icon: <IconLogout className="size-4" />,
        onSelect: () => void signOut(router),
      },
    ],
  };

  const groups = [
    ...searchGroups,
    navigate,
    repos.commands.length > 0 ? repos : null,
    account,
  ].filter((group): group is CommandGroup => group !== null);

  return (
    <CommandPalette
      open={open}
      onClose={onClose}
      groups={groups}
      query={query}
      onQueryChange={setQuery}
      loading={loading}
      placeholder={
        activeRepoId
          ? "Search files, symbols, routes, docs, threads…"
          : "Jump anywhere…"
      }
      emptyState={
        <PaletteEmptyState
          query={trimmed}
          indexed={answered.indexed}
          failed={answered.failed}
        />
      }
    />
  );
}

/** Why there's nothing here — never a bare "no results" (Priority 9: an
 * empty state that can name its cause should always name it). */
function PaletteEmptyState({
  query,
  indexed,
  failed,
}: {
  query: string;
  indexed: boolean;
  failed: boolean;
}) {
  const message = failed
    ? "Search couldn’t reach the backend. Your session may have expired, or the API isn’t running."
    : !indexed
      ? "This repository hasn’t been studied yet, so there’s nothing indexed to search. Run a sync from the Briefing and it’ll be searchable."
      : `Nothing matches “${query}” in the files, symbols, routes, docs or threads Blueprint has indexed.`;

  return (
    <p className="px-6 py-8 text-center text-sm leading-relaxed text-ink-500 dark:text-ink-400">
      {message}
    </p>
  );
}
