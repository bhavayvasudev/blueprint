"use client";

import type { SearchResults } from "@blueprint/shared-types";
import { PUBLIC_API_BASE_URL } from "@/lib/config";

/** Browser-side global search (RULES.md §7: genuinely interactive surfaces
 * call the API from the client). Search runs per keystroke, so this takes an
 * `AbortSignal` — an in-flight request for a stale query is cancelled rather
 * than raced, which is what stops results from flickering backwards when a
 * slower earlier request lands after a faster later one. */
export async function searchRepository(
  repositoryId: string,
  query: string,
  signal?: AbortSignal,
): Promise<SearchResults> {
  const res = await fetch(
    `${PUBLIC_API_BASE_URL}/api/v1/repos/${repositoryId}/search?q=${encodeURIComponent(query)}`,
    { credentials: "include", signal },
  );
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return (await res.json()) as SearchResults;
}
