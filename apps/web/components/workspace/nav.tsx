import type { ComponentType } from "react";
import { IconArchitecture, IconBriefing, IconInsights, IconSearch, IconThreads } from "./icons";

export interface WorkspaceNavItem {
  key: string;
  label: string;
  /** Shorter label used in the dock. */
  dockLabel: string;
  icon: ComponentType<{ className?: string }>;
  /** null → this room is shown (the map is honest about its own
   * territory) but not navigable right now; `unavailableHint` says why.
   * Ignored when `action` is true. */
  href: (activeRepoId: string | null) => string | null;
  unavailableHint: string;
  /** True for the one entry that opens the command palette instead of
   * routing anywhere — Search is a verb, not a room. */
  action?: boolean;
}

/** The workspace's destinations: the Briefing (what does the architect
 * think?), the Atlas (what is the shape of this system?), the Threads
 * (what am I trying to find out?), and the Insights (what does the
 * evidence look like on its own?) — plus Search, which is an action,
 * not a room. One nav model drives both the top pill and the dock, so
 * the two can never disagree about what the workspace offers. */
export const WORKSPACE_NAV: WorkspaceNavItem[] = [
  {
    key: "briefing",
    label: "The Briefing",
    dockLabel: "Briefing",
    icon: IconBriefing,
    href: () => "/dashboard",
    unavailableHint: "",
  },
  {
    key: "atlas",
    label: "The Atlas",
    dockLabel: "Atlas",
    icon: IconArchitecture,
    href: (repoId) => (repoId ? `/repo/${repoId}` : null),
    unavailableHint: "Awaits a studied repository",
  },
  {
    key: "threads",
    label: "The Threads",
    dockLabel: "Threads",
    icon: IconThreads,
    href: (repoId) => (repoId ? `/repo/${repoId}/threads` : null),
    unavailableHint: "Awaits a connected repository",
  },
  {
    key: "insights",
    label: "Insights",
    dockLabel: "Insights",
    icon: IconInsights,
    href: (repoId) => (repoId ? `/repo/${repoId}/insights` : null),
    unavailableHint: "Awaits a studied repository",
  },
  {
    key: "search",
    label: "Search",
    dockLabel: "Search",
    icon: IconSearch,
    href: () => null,
    unavailableHint: "",
    action: true,
  },
];
