import { cookies } from "next/headers";
import type {
  ArchitectureGraph,
  AvailableRepository,
  Installation,
  Repository,
  Snapshot,
  Thread,
  User,
} from "@blueprint/shared-types";
import { API_BASE_URL } from "./config";

const SESSION_COOKIE_NAME = "blueprint_session";

/** Every Server Component data fetch goes through this one function
 * (RULES.md §5: "No component may call fetch/API clients directly
 * except at the route/page level") — it forwards the browser's session
 * cookie as a `Cookie` header on the server-to-server call, since a
 * Node.js `fetch` to a different port does not carry the incoming
 * request's cookies automatically the way a browser request would.
 * Always `cache: "no-store"`: every surface here (repo status, snapshot
 * status, the architecture graph) is read live, never stale — this is a
 * viewer over a backend-computed model (ARCHITECTURE.md §15), not
 * content worth risking staleness on. */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers ?? {}),
      ...(session ? { Cookie: `${SESSION_COOKIE_NAME}=${session}` } : {}),
    },
  });
}

export class UnauthenticatedError extends Error {}

export async function getCurrentUser(): Promise<User | null> {
  const res = await apiFetch("/api/v1/auth/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /auth/me failed: ${res.status}`);
  return (await res.json()) as User;
}

export async function listInstallations(): Promise<Installation[]> {
  const res = await apiFetch("/api/v1/installations");
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) throw new Error(`GET /installations failed: ${res.status}`);
  return (await res.json()) as Installation[];
}

export async function listRepositories(): Promise<Repository[]> {
  const res = await apiFetch("/api/v1/repos");
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) throw new Error(`GET /repos failed: ${res.status}`);
  return (await res.json()) as Repository[];
}

export async function getRepository(id: string): Promise<Repository | null> {
  const res = await apiFetch(`/api/v1/repos/${id}`);
  if (res.status === 401) throw new UnauthenticatedError();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /repos/${id} failed: ${res.status}`);
  return (await res.json()) as Repository;
}

export async function listSnapshots(repositoryId: string): Promise<Snapshot[]> {
  const res = await apiFetch(`/api/v1/repos/${repositoryId}/snapshots`);
  if (!res.ok) throw new Error(`GET snapshots failed: ${res.status}`);
  return (await res.json()) as Snapshot[];
}

export async function getArchitectureGraph(
  repositoryId: string,
  snapshotId: string,
): Promise<ArchitectureGraph> {
  const res = await apiFetch(
    `/api/v1/repos/${repositoryId}/snapshots/${snapshotId}/architecture-graph`,
  );
  if (!res.ok) throw new Error(`GET architecture-graph failed: ${res.status}`);
  return (await res.json()) as ArchitectureGraph;
}

export async function listAvailableRepositories(
  installationId: string,
): Promise<AvailableRepository[]> {
  const res = await apiFetch(`/api/v1/repos/available?installation_id=${installationId}`);
  if (!res.ok) throw new Error(`GET /repos/available failed: ${res.status}`);
  return (await res.json()) as AvailableRepository[];
}

export async function listThreads(repositoryId: string): Promise<Thread[]> {
  const res = await apiFetch(`/api/v1/repos/${repositoryId}/threads`);
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) throw new Error(`GET threads failed: ${res.status}`);
  return (await res.json()) as Thread[];
}

export async function listThreadSuggestions(repositoryId: string): Promise<string[]> {
  const res = await apiFetch(`/api/v1/repos/${repositoryId}/threads/suggestions`);
  if (!res.ok) throw new Error(`GET thread suggestions failed: ${res.status}`);
  return (await res.json()) as string[];
}
