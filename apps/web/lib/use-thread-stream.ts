"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Evidence, ThreadStatus } from "@blueprint/shared-types";
import { PUBLIC_API_BASE_URL } from "@/lib/config";

export interface ThreadPhase {
  phase: string;
  label: string;
}

export interface StreamDone {
  messageId: string;
  threadId: string;
  title: string;
  status: ThreadStatus;
}

export interface LiveAnswer {
  /** True from the moment a question is sent until the stream resolves. */
  streaming: boolean;
  /** The current "repository thinking" phase — a real step (searching the
   * graph, reading matched modules, composing), not a fake typing dot. */
  phase: ThreadPhase | null;
  /** The resolved citations, delivered once before generation begins. */
  evidence: Evidence[];
  /** The answer prose, accumulated token by token (markdown). */
  answer: string;
  followups: string[];
  done: StreamDone | null;
  error: string | null;
}

const IDLE: LiveAnswer = {
  streaming: false,
  phase: null,
  evidence: [],
  answer: "",
  followups: [],
  done: null,
  error: null,
};

/** Drives one grounded answer: POSTs the question, reads the Server-Sent-
 * Event stream, and exposes the evolving answer as state. Kept separate
 * from the CRUD client because streaming a `ReadableStream` and re-rendering
 * per token is a different concern from ordinary JSON fetches. */
export function useThreadStream() {
  const [live, setLive] = useState<LiveAnswer>(IDLE);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLive(IDLE);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = useCallback(
    async (repositoryId: string, threadId: string, question: string): Promise<StreamDone | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLive({ ...IDLE, streaming: true });

      let done: StreamDone | null = null;
      try {
        const res = await fetch(
          `${PUBLIC_API_BASE_URL}/api/v1/repos/${repositoryId}/threads/${threadId}/ask`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
            body: JSON.stringify({ question }),
            signal: controller.signal,
          },
        );
        if (!res.ok || !res.body) {
          throw new Error(`The repository couldn't answer right now (${res.status}).`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE frames are separated by a blank line.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const parsed = parseFrame(frame);
            if (parsed) done = applyEvent(parsed.event, parsed.data, setLive) ?? done;
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return null;
        setLive((prev) => ({
          ...prev,
          streaming: false,
          error: (err as Error).message || "Something went wrong reaching the repository.",
        }));
        return null;
      }
      setLive((prev) => ({ ...prev, streaming: false }));
      return done;
    },
    [],
  );

  return { live, ask, reset };
}

function parseFrame(frame: string): { event: string; data: unknown } | null {
  let event = "";
  let dataLine = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
  }
  if (!event || !dataLine) return null;
  try {
    return { event, data: JSON.parse(dataLine) };
  } catch {
    return null;
  }
}

/** Fold one SSE event into live state. Returns the `done` payload when the
 * stream completes, so the caller can refresh persisted data. */
function applyEvent(
  event: string,
  data: unknown,
  setLive: React.Dispatch<React.SetStateAction<LiveAnswer>>,
): StreamDone | null {
  const payload = data as Record<string, unknown>;
  switch (event) {
    case "phase":
      setLive((p) => ({ ...p, phase: { phase: String(payload.phase), label: String(payload.label) } }));
      return null;
    case "evidence":
      setLive((p) => ({ ...p, evidence: (payload.evidence as Evidence[]) ?? [] }));
      return null;
    case "token":
      setLive((p) => ({ ...p, answer: p.answer + String(payload.text ?? "") }));
      return null;
    case "followups":
      setLive((p) => ({ ...p, followups: (payload.questions as string[]) ?? [] }));
      return null;
    case "done": {
      const done: StreamDone = {
        messageId: String(payload.message_id),
        threadId: String(payload.thread_id),
        title: String(payload.title),
        status: payload.status as ThreadStatus,
      };
      setLive((p) => ({ ...p, streaming: false, phase: null, done }));
      return done;
    }
    case "error":
      setLive((p) => ({ ...p, streaming: false, phase: null, error: String(payload.message) }));
      return null;
    default:
      return null;
  }
}
