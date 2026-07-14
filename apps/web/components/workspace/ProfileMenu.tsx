"use client";

import { Popover, PopoverDivider, PopoverItem, PopoverSectionLabel } from "@blueprint/ui";
import type { User } from "@blueprint/shared-types";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { signOut } from "@/lib/auth-client";
import { PUBLIC_API_BASE_URL } from "@/lib/config";
import { initials } from "@/lib/format";
import type { WorkspaceDialogKind } from "./WorkspaceShell";
import {
  IconAppearance,
  IconChevronDown,
  IconCommand,
  IconGitHub,
  IconLogout,
  IconSettings,
  IconUser,
} from "./icons";

/** The one profile entry point in the workspace — everything the
 * signed-out sidebar used to duplicate now lives here, once. */
export function ProfileMenu({
  user,
  onOpenDialog,
}: {
  user: User;
  onOpenDialog: (dialog: WorkspaceDialogKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();

  function openDialog(dialog: WorkspaceDialogKind) {
    setOpen(false);
    onOpenDialog(dialog);
  }

  async function handleSignOut() {
    setOpen(false);
    await signOut(router);
  }

  return (
    <>
      <motion.button
        ref={triggerRef}
        type="button"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="flex items-center gap-1.5 rounded-full p-1 pr-2 text-ink-600 transition-colors hover:bg-ink-950/5 dark:text-ink-300 dark:hover:bg-white/8"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-ink-50 ring-1 ring-white/10 dark:bg-ink-100 dark:text-ink-950 dark:ring-ink-950/10">
          {initials(user.name)}
        </span>
        <IconChevronDown className="size-3.5" />
      </motion.button>

      <Popover open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} align="end" aria-label="Account menu">
        <PopoverSectionLabel>{user.name}</PopoverSectionLabel>
        <PopoverItem icon={<IconUser />} onSelect={() => openDialog("account")}>
          Profile
        </PopoverItem>
        <PopoverItem icon={<IconSettings />} onSelect={() => openDialog("account")}>
          Settings
        </PopoverItem>
        <PopoverItem icon={<IconAppearance />} onSelect={() => openDialog("appearance")}>
          Appearance
        </PopoverItem>
        <PopoverItem
          icon={<IconGitHub />}
          href={`${PUBLIC_API_BASE_URL}/api/v1/auth/github/install`}
          onSelect={() => setOpen(false)}
        >
          GitHub account
        </PopoverItem>
        <PopoverDivider />
        <PopoverItem icon={<IconCommand />} hint="⌘K" onSelect={() => openDialog("shortcuts")}>
          Keyboard shortcuts
        </PopoverItem>
        <PopoverDivider />
        <PopoverItem icon={<IconLogout />} tone="danger" onSelect={handleSignOut}>
          Sign out
        </PopoverItem>
      </Popover>
    </>
  );
}
