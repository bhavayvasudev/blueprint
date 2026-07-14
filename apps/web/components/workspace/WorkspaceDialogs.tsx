"use client";

import { Button, Dialog, Kbd } from "@blueprint/ui";
import type { User } from "@blueprint/shared-types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useTheme } from "@/components/theme/ThemeProvider";
import { signOut } from "@/lib/auth-client";
import { PUBLIC_API_BASE_URL } from "@/lib/config";
import { initials } from "@/lib/format";
import { IconGitHub, IconLogout } from "./icons";

/** The account surface reached from the profile menu's "Profile" and
 * "Settings" entries — real signed-in identity (there is nothing to
 * fabricate: `User` only carries name/email/github id), a real
 * GitHub-management link, and a real sign-out action that clears the
 * session cookie server-side (POST /api/v1/auth/logout) before
 * returning to the signed-out landing page. */
export function AccountDialog({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: User;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut(router);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Account">
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-ink-900 text-lg font-semibold text-ink-50 ring-1 ring-white/10 dark:bg-ink-100 dark:text-ink-950 dark:ring-ink-950/10">
          {initials(user.name)}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base font-semibold text-ink-950 dark:text-ink-50">
            {user.name}
          </span>
          <span className="truncate text-sm text-ink-500 dark:text-ink-400">{user.email}</span>
        </div>
      </div>

      <div className="mt-7 flex flex-col gap-2">
        <a
          href={`${PUBLIC_API_BASE_URL}/api/v1/auth/github/install`}
          className="glass edge-light flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-ink-700 transition-colors hover:text-ink-950 dark:text-ink-300 dark:hover:text-ink-50"
        >
          <IconGitHub className="size-4.5" />
          Manage GitHub account access
        </a>
      </div>

      <p className="mt-5 text-xs text-ink-400 dark:text-ink-500">
        Deeper settings — notification preferences, workspace membership — arrive in a later
        phase. This is the whole of what Blueprint knows about you today.
      </p>

      <div className="mt-8 flex items-center justify-end gap-3 border-t border-ink-950/6 pt-6 dark:border-white/8">
        <Button variant="danger" size="sm" loading={signingOut} onClick={handleSignOut}>
          <IconLogout className="size-4" />
          Sign out
        </Button>
      </div>
    </Dialog>
  );
}

/** Appearance is exactly one real, working control: the theme switch.
 * No invented options — a settings surface that promises more than it
 * has is worse than a short one. */
export function AppearanceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  return (
    <Dialog open={open} onClose={onClose} title="Appearance" description="How the workspace looks.">
      <div className="glass edge-light flex items-center justify-between rounded-xl px-5 py-4">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-ink-950 dark:text-ink-50">Theme</span>
          <span className="text-xs text-ink-500 dark:text-ink-400">
            Currently {theme === "dark" ? "dark" : "light"}
          </span>
        </div>
        <ThemeToggle />
      </div>
    </Dialog>
  );
}

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["⌘", "K"], label: "Open search / command palette" },
  { keys: ["↑", "↓"], label: "Move through results" },
  { keys: ["⏎"], label: "Go to the selected result" },
  { keys: ["Esc"], label: "Close the palette, a menu, or a dialog" },
];

/** Only shortcuts that are actually wired — a shortcuts panel that
 * lists a binding which does nothing is a worse failure than a short
 * list. */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <ul className="flex flex-col gap-1">
        {SHORTCUTS.map((shortcut) => (
          <li
            key={shortcut.label}
            className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-sm text-ink-700 dark:text-ink-300"
          >
            <span>{shortcut.label}</span>
            <span className="flex shrink-0 gap-1">
              {shortcut.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
