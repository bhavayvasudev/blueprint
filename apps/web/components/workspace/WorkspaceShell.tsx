"use client";

import type { Repository, User } from "@blueprint/shared-types";
import { useCallback, useEffect, useState } from "react";
import { AmbientBackground } from "./AmbientBackground";
import { Dock } from "./Dock";
import { TopBar } from "./TopBar";
import { WorkspaceCommandPalette } from "./WorkspaceCommandPalette";
import { AccountDialog, AppearanceDialog, ShortcutsDialog } from "./WorkspaceDialogs";

export type WorkspaceDialogKind = "account" | "appearance" | "shortcuts" | null;

/** The workspace, assembled by z-layer (the master layout contract):
 *
 *   far background — particles / gradients / light   (AmbientBackground)
 *   background     — animated architecture           (AmbientBackground)
 *   midground      — the page's content (children)
 *   foreground     — chrome: the floating top pill and dock
 *
 * There is no side rail — the workspace has exactly two pieces of
 * chrome, both floating, both reachable with one hand. This shell also
 * owns the ⌘K palette and the three account dialogs, since the top
 * pill's profile menu, the dock's Search entry, and the palette itself
 * all need to open the same layer. Server pages fetch data and render
 * inside this shell; the shell is pure composition plus that one slice
 * of interaction state. */
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dialog, setDialog] = useState<WorkspaceDialogKind>(null);

  const openSearch = useCallback(() => setPaletteOpen(true), []);
  const closeSearch = useCallback(() => setPaletteOpen(false), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative min-h-dvh w-full">
      <AmbientBackground />
      <TopBar
        user={user}
        repositories={repositories}
        activeRepoId={activeRepoId}
        onOpenSearch={openSearch}
        onOpenDialog={setDialog}
      />
      <main className="relative z-10 pb-32">{children}</main>
      <Dock activeNav={activeNav} activeRepoId={activeRepoId} onOpenSearch={openSearch} />

      <WorkspaceCommandPalette
        open={paletteOpen}
        onClose={closeSearch}
        repositories={repositories}
        activeRepoId={activeRepoId}
        onOpenDialog={setDialog}
      />
      <AccountDialog open={dialog === "account"} onClose={closeDialog} user={user} />
      <AppearanceDialog open={dialog === "appearance"} onClose={closeDialog} />
      <ShortcutsDialog open={dialog === "shortcuts"} onClose={closeDialog} />
    </div>
  );
}
