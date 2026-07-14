"use client";

import type { Repository, User } from "@blueprint/shared-types";
import { AmbientBackground } from "./AmbientBackground";
import { Dock } from "./Dock";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/** The workspace, assembled by z-layer (the master layout contract):
 *
 *   far background — particles / gradients / light   (AmbientBackground)
 *   background     — animated architecture           (AmbientBackground)
 *   midground      — the page's content (children)
 *   foreground     — chrome: sidebar, top bar, dock
 *
 * Server pages fetch data and render inside this shell; the shell is
 * pure composition. */
export function WorkspaceShell({
  user,
  repositories,
  activeNav,
  activeRepoId,
  children,
}: {
  user: User;
  repositories: Repository[];
  activeNav: string;
  activeRepoId: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-dvh w-full">
      <AmbientBackground />
      <Sidebar
        user={user}
        repositories={repositories}
        activeNav={activeNav}
        activeRepoId={activeRepoId}
      />
      <TopBar user={user} />
      <main className="relative z-10 pb-36 lg:pl-72">{children}</main>
      <Dock activeNav={activeNav} activeRepoId={activeRepoId} />
    </div>
  );
}
