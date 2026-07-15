"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { useState } from "react";

/** Server state (sync/snapshot polling) goes through React Query, local
 * UI state stays in component state — no global store (ARCHITECTURE.md
 * §15). One `QueryClient` per browser session, created lazily so it
 * isn't shared across requests on the server (React Query's own
 * documented App Router pattern). `MotionConfig reducedMotion="user"` is
 * the one app-wide guarantee that every `whileHover`/`whileTap`/`animate`
 * gesture — including ones that don't hand-check `useReducedMotion`
 * themselves — degrades to an instant, transform-free transition under
 * the OS setting; components with bespoke motion (Tilt, Float, glow
 * drift) still branch explicitly where a whole effect needs disabling. */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </QueryClientProvider>
  );
}
