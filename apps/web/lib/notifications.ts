import type { ConnectionStatus, Repository } from "@blueprint/shared-types";
import { repoDisplayName } from "./format";

export type NotificationTone = "ready" | "failed" | "neutral";

export interface NotificationItem {
  id: string;
  tone: NotificationTone;
  message: string;
  timestamp: string | null;
  repositoryId: string;
}

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

function statusMessage(repository: Repository, status: ConnectionStatus): { tone: NotificationTone; message: string } {
  const name = repoDisplayName(repository.full_name);
  if (status === "error") {
    return { tone: "failed", message: `Connection issue with ${name} — the last sync couldn't reach it.` };
  }
  if (status === "revoked") {
    return { tone: "failed", message: `Access to ${name} was revoked on GitHub.` };
  }
  if (!repository.last_synced_at) {
    return { tone: "neutral", message: `${name} is connected but hasn't been studied yet.` };
  }
  return { tone: "ready", message: `${name} synced${repository.last_synced_sha ? ` at ${repository.last_synced_sha.slice(0, 7)}` : ""}.` };
}

/** Derives the notifications feed entirely from the `Repository[]` the
 * workspace already has in hand — no new endpoint, no invented
 * event log, no read/unread state that would need its own storage.
 * Every line traces to a real field on a real repository. */
export function buildNotifications(repositories: Repository[]): NotificationItem[] {
  return [...repositories]
    .sort((a, b) => (b.last_synced_at ?? "").localeCompare(a.last_synced_at ?? ""))
    .slice(0, 8)
    .map((repository) => {
      const { tone, message } = statusMessage(repository, repository.connection_status);
      return {
        id: repository.id,
        tone,
        message,
        timestamp: repository.last_synced_at,
        repositoryId: repository.id,
      };
    });
}

export function hasRecentActivity(items: NotificationItem[]): boolean {
  const now = Date.now();
  return items.some((item) => {
    if (item.tone === "failed") return true;
    if (!item.timestamp) return false;
    return now - new Date(item.timestamp).getTime() < RECENT_WINDOW_MS;
  });
}
