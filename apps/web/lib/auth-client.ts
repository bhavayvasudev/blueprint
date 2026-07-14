"use client";

import { PUBLIC_API_BASE_URL } from "./config";

interface RouterLike {
  push: (href: string) => void;
  refresh: () => void;
}

/** The one real sign-out action, shared by the profile menu, the
 * account dialog, and the command palette so the three entry points
 * can never drift out of sync on what "sign out" actually does: clear
 * the session cookie server-side, then return to the signed-out
 * landing page. */
export async function signOut(router: RouterLike): Promise<void> {
  try {
    await fetch(`${PUBLIC_API_BASE_URL}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } finally {
    router.push("/");
    router.refresh();
  }
}
