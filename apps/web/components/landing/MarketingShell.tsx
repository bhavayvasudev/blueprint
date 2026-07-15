import type { ReactNode } from "react";
import { AmbientBackground } from "@/components/workspace/AmbientBackground";
import { PUBLIC_API_BASE_URL } from "@/lib/config";
import { LandingNav } from "./Nav";
import { Footer } from "./Footer";

/** The chrome every static marketing page shares with the landing page
 * itself — same floating nav, same ambient stage, same footer — so a
 * visitor moving from the hero to /docs or /contact never leaves the
 * one visual language. Pages compose their own content between. */
export function MarketingShell({ children }: { children: ReactNode }) {
  const signInHref = `${PUBLIC_API_BASE_URL}/api/v1/auth/login`;

  return (
    <div className="relative flex min-h-dvh w-full flex-col overflow-hidden">
      <AmbientBackground />
      <LandingNav signInHref={signInHref} />
      <main className="relative z-10 flex-1 px-6 pt-32 pb-24 lg:px-12 lg:pt-40">{children}</main>
      <Footer />
    </div>
  );
}
