"use client";

import { CommandPalette, type CommandGroup } from "@blueprint/ui";
import type { Repository } from "@blueprint/shared-types";
import { useRouter } from "next/navigation";
import { PUBLIC_API_BASE_URL } from "@/lib/config";
import { signOut } from "@/lib/auth-client";
import { repoDisplayName } from "@/lib/format";
import type { WorkspaceDialogKind } from "./WorkspaceShell";
import {
  IconAppearance,
  IconArchitecture,
  IconBriefing,
  IconGitHub,
  IconInsights,
  IconLogout,
  IconPlus,
  IconThreads,
} from "./icons";

/** The ⌘K layer's real command set — every entry routes somewhere real
 * or opens a real dialog. Rooms that don't exist for the current
 * context (Atlas/Insights/Threads with no active repository) simply
 * don't appear, rather than appearing disabled — a command palette's
 * job is to offer only what it can actually do. */
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

  const navigate: CommandGroup = {
    label: "Navigate",
    commands: [
      {
        id: "nav-briefing",
        label: "The Briefing",
        hint: "Overview",
        icon: <IconBriefing className="size-4" />,
        keywords: "home overview dashboard",
        onSelect: () => router.push("/dashboard"),
      },
      ...(activeRepoId
        ? [
            {
              id: "nav-atlas",
              label: "The Atlas",
              hint: "Architecture",
              icon: <IconArchitecture className="size-4" />,
              keywords: "graph modules structure",
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
              hint: "Coming soon",
              icon: <IconThreads className="size-4" />,
              keywords: "chat ask question",
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

  const groups = [navigate, repos.commands.length > 0 ? repos : null, account].filter(
    (group): group is CommandGroup => group !== null,
  );

  return <CommandPalette open={open} onClose={onClose} groups={groups} />;
}
