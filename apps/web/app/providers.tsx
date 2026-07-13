"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/** Server state (sync/snapshot polling) goes through React Query, local
 * UI state stays in component state — no global store (ARCHITECTURE.md
 * §15). One `QueryClient` per browser session, created lazily so it
 * isn't shared across requests on the server (React Query's own
 * documented App Router pattern). */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
