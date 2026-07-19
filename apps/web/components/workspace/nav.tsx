import type { ComponentType } from "react";
import { IconArchitecture, IconBriefing, IconInsights, IconThreads } from "./icons";

export interface WorkspaceNavItem {
  key: string;
  label: string;
  /** Shorter label used in the dock. */
  dockLabel: string;
  icon: ComponentType<{ className?: string }>;
  /** null → this room is shown (the map is honest about its own
   * territory) but not navigable right now; `unavailableHint` says why. */
  href: (activeRepoId: string | null) => string | null;
  unavailableHint: string;
}

/** The workspace's destinations: the Briefing (what does the architect
 * think?), the Atlas (what is the shape of this system?), the Threads
 * (what am I trying to find out?), and the Insights (what does the
 * evidence look like on its own?). Rooms only.
 *
 * Search used to sit here too, which gave the workspace two search
 * affordances — this dock entry and the top pill's button — that opened
 * the same palette and so read as two different searches. Search is a
 * verb, not a room: it has exactly one entry point now, the ⌘K button in
 * the top pill, and the dock is purely room-to-room. */
export const WORKSPACE_NAV: WorkspaceNavItem[] = [
  {
    key: "briefing",
    label: "The Briefing",
    dockLabel: "Briefing",
    icon: IconBriefing,
    // Per-repo when a repository is in context (so walking into a repo and
    // opening the Briefing shows *that* repository), the home arrival
    // otherwise.
    href: (repoId) => (repoId ? `/repo/${repoId}/briefing` : "/dashboard"),
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
];
