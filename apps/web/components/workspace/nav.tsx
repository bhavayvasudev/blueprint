import type { ComponentType } from "react";
import { IconArchitecture, IconBriefing, IconThreads } from "./icons";

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

/** The workspace has exactly three rooms (PRODUCT.md: "Three rooms, no
 * more") — the Briefing (what does the architect think?), the Atlas
 * (what is the shape of this system?), and the Threads (what am I
 * trying to find out?). Any fourth destination is one of these wearing
 * a new label. One nav model drives both the sidebar and the dock, so
 * the two can never disagree about what rooms the workspace has. */
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
    href: () => null,
    unavailableHint: "Ships in a later phase",
  },
];
