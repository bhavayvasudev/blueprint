"use client";

import type { Thread, ThreadDetail, ThreadStatus } from "@blueprint/shared-types";
import { PUBLIC_API_BASE_URL } from "@/lib/config";

/** Browser-side Threads API (RULES.md §7: genuinely interactive surfaces
 * call the API from the client, cookie-authenticated). The streaming `ask`
 * lives in `use-thread-stream.ts`; everything here is ordinary JSON. */

const base = (repositoryId: string) => `${PUBLIC_API_BASE_URL}/api/v1/repos/${repositoryId}/threads`;

export async function fetchThreads(repositoryId: string): Promise<Thread[]> {
  const res = await fetch(base(repositoryId), { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load threads (${res.status})`);
  return (await res.json()) as Thread[];
}

export async function fetchThread(repositoryId: string, threadId: string): Promise<ThreadDetail> {
  const res = await fetch(`${base(repositoryId)}/${threadId}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load thread (${res.status})`);
  return (await res.json()) as ThreadDetail;
}

export async function createThread(
  repositoryId: string,
  firstQuestion?: string,
): Promise<ThreadDetail> {
  const res = await fetch(base(repositoryId), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ first_question: firstQuestion ?? null }),
  });
  if (!res.ok) throw new Error(`Failed to create thread (${res.status})`);
  return (await res.json()) as ThreadDetail;
}

export async function patchThread(
  repositoryId: string,
  threadId: string,
  patch: { pinned?: boolean; title?: string; status?: ThreadStatus },
): Promise<Thread> {
  const res = await fetch(`${base(repositoryId)}/${threadId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update thread (${res.status})`);
  return (await res.json()) as Thread;
}

export async function deleteThread(repositoryId: string, threadId: string): Promise<void> {
  const res = await fetch(`${base(repositoryId)}/${threadId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete thread (${res.status})`);
}
