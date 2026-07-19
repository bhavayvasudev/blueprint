"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Repository, Thread, ThreadDetail } from "@blueprint/shared-types";
import { repoDisplayName } from "@/lib/format";
import {
  createThread,
  deleteThread,
  fetchThread,
  patchThread,
} from "@/lib/threads-client";
import { useThreadStream } from "@/lib/use-thread-stream";
import { Composer } from "./Composer";
import { ConversationTimeline } from "./ConversationTimeline";
import { ThreadListPanel } from "./ThreadListPanel";
import { ThreadsEmptyState } from "./ThreadsEmptyState";

/** The Threads room: a two-pane investigation workspace (list + main), the
 * whole thing sitting inside the workspace shell's floating chrome. Owns the
 * conversation state and the streaming turn; the panels are presentational.
 *
 * A "turn" is: show the question immediately, stream the grounded answer
 * (evidence + prose + follow-ups), then refetch the persisted thread so what
 * stays on screen is exactly what the backend stored — no client-side
 * reconstruction of an answer the server is the source of truth for. */
export function ThreadsWorkspace({
  repository,
  initialThreads,
  suggestions,
}: {
  repository: Repository;
  initialThreads: Thread[];
  suggestions: string[];
}) {
  const repoName = repoDisplayName(repository.full_name);
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const { live, ask, reset } = useThreadStream();

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  // Follow the conversation as it grows (new turn, streamed tokens, evidence).
  useEffect(() => {
    scrollToBottom();
  }, [detail?.messages.length, pendingQuestion, live.answer, live.evidence.length, scrollToBottom]);

  const selectThread = useCallback(
    async (id: string) => {
      reset();
      setPendingQuestion(null);
      setActiveId(id);
      setDetail(null);
      try {
        setDetail(await fetchThread(repository.id, id));
      } catch {
        setDetail(null);
      }
    },
    [repository.id, reset],
  );

  const startNew = useCallback(() => {
    reset();
    setPendingQuestion(null);
    setActiveId(null);
    setDetail(null);
  }, [reset]);

  const runTurn = useCallback(
    async (question: string) => {
      if (live.streaming) return;

      let threadId = activeId;
      // No active thread → open a new investigation for this question.
      if (!threadId) {
        try {
          const created = await createThread(repository.id, question);
          threadId = created.id;
          setActiveId(created.id);
          setDetail(created);
          setThreads((prev) => [created, ...prev]);
        } catch {
          setPendingQuestion(null);
          return;
        }
      }

      setPendingQuestion(question);
      const done = await ask(repository.id, threadId, question);

      // Reconcile with the server's stored truth: refetch the thread (now
      // holding the persisted question + grounded answer) and the list
      // (title/status/ordering changed on the first answer).
      try {
        const fresh = await fetchThread(repository.id, threadId);
        setDetail(fresh);
        setThreads((prev) => {
          const next = prev.map((t) =>
            t.id === threadId
              ? { ...t, title: done?.title ?? t.title, status: done?.status ?? t.status, updated_at: fresh.updated_at }
              : t,
          );
          // Move the just-touched thread to the top of its pin group.
          next.sort((a, b) =>
            a.pinned === b.pinned
              ? new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
              : Number(b.pinned) - Number(a.pinned),
          );
          return next;
        });
      } catch {
        /* keep the streamed answer on screen if the refetch fails */
      }
      setPendingQuestion(null);
      reset();
    },
    [activeId, ask, live.streaming, repository.id, reset],
  );

  const togglePin = useCallback(
    async (thread: Thread) => {
      const optimistic = { ...thread, pinned: !thread.pinned };
      setThreads((prev) => prev.map((t) => (t.id === thread.id ? optimistic : t)));
      try {
        const updated = await patchThread(repository.id, thread.id, { pinned: optimistic.pinned });
        setThreads((prev) => prev.map((t) => (t.id === thread.id ? updated : t)));
      } catch {
        setThreads((prev) => prev.map((t) => (t.id === thread.id ? thread : t)));
      }
    },
    [repository.id],
  );

  const removeThread = useCallback(
    async (thread: Thread) => {
      setThreads((prev) => prev.filter((t) => t.id !== thread.id));
      if (activeId === thread.id) startNew();
      try {
        await deleteThread(repository.id, thread.id);
      } catch {
        setThreads((prev) => [thread, ...prev]);
      }
    },
    [activeId, repository.id, startNew],
  );

  return (
    <div className="mx-auto mt-20 grid h-[calc(100dvh-13rem)] w-full max-w-6xl grid-cols-1 gap-4 px-4 md:grid-cols-[19rem_1fr]">
      <aside className="hidden min-h-0 md:block">
        <ThreadListPanel
          threads={threads}
          activeId={activeId}
          onSelect={selectThread}
          onNew={startNew}
          onTogglePin={togglePin}
          onDelete={removeThread}
        />
      </aside>

      <section className="glass-strong edge-light flex min-h-0 flex-col rounded-2xl">
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {activeId && detail ? (
            <ConversationTimeline
              messages={detail.messages}
              pendingQuestion={pendingQuestion}
              live={live}
              repositoryId={repository.id}
              onFollowup={runTurn}
            />
          ) : (
            <ThreadsEmptyState
              repositoryName={repoName}
              suggestions={suggestions}
              onPick={runTurn}
              disabled={live.streaming}
            />
          )}
        </div>
        <div className="shrink-0 border-t border-ink-950/[0.06] p-4 dark:border-white/[0.06]">
          <Composer onSubmit={runTurn} disabled={live.streaming} autoFocus={!activeId} />
        </div>
      </section>
    </div>
  );
}
