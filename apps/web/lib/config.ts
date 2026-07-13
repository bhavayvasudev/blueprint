// The API's own base URL (ARCHITECTURE.md §12). `API_BASE_URL` is used
// for server-to-server calls (Server Components, never exposed to the
// browser); `NEXT_PUBLIC_API_BASE_URL` is the same value made available
// to Client Components (RULES.md §7: interactivity like the sync
// trigger genuinely needs to call the API from the browser).
export const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8000";
export const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? API_BASE_URL;
