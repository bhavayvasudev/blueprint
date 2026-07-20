import type { SnapshotStatus } from "@blueprint/shared-types";

/** The one-line headline a room shows above `StudyProgress`, per status.
 *
 * Exists because three rooms (Atlas, Briefing, Insights) each had their own
 * two-branch ternary — "failed" or, implicitly, "I'm reading this
 * repository." Once studies can queue, that fallback became a false claim:
 * a queued repository is not being read, and a cancelled one is not being
 * read either. Rather than repeat a five-way branch in three places and let
 * them drift, each room passes the noun it wants and gets a sentence that
 * is true of the state the study is actually in.
 *
 * `subject` is the room's own phrasing for what is being studied — "this
 * repository", a repository's full name — so the sentences read naturally
 * in each room without the rooms having to know the statuses.
 */
export function studyHeadline(
  status: SnapshotStatus,
  { subject, absent }: { subject: string; absent: string },
): string {
  switch (status) {
    case "queued":
      // No worker has begun; say so rather than implying work is underway.
      return `${subject} is queued for study.`;
    case "indexing":
      return `I'm reading ${subject}.`;
    case "cancelled":
      // Not a failure — the user stopped it, and the copy shouldn't imply
      // something went wrong.
      return `The study of ${subject} was cancelled — ${absent}`;
    case "failed":
      return `The study failed — ${absent}`;
    case "ready":
      // Rooms only render this headline while there is nothing to show, so
      // a `ready` snapshot reaching here means the study finished between
      // the server render and this poll. Saying it's ready is the truthful
      // thing to show for the moment before the room re-renders with data.
      return `${subject} is ready.`;
  }
}
