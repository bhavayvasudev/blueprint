"use client";

import { motion } from "framer-motion";
import type { ThreadMessage } from "@blueprint/shared-types";
import { AssistantAnswer } from "./AssistantAnswer";
import type { LiveAnswer } from "@/lib/use-thread-stream";

/** The main thread — a large, clean, editorial conversation. No avatars,
 * no bubbles: the user's question sits as a quiet heading, Blueprint's
 * answer unfolds beneath it in sections. An investigation reads as a
 * growing knowledge trail, not a chat log (PRODUCT-spec: "Threads are
 * investigations"). */
export function ConversationTimeline({
  messages,
  pendingQuestion,
  live,
  repositoryId,
  onFollowup,
}: {
  messages: ThreadMessage[];
  pendingQuestion: string | null;
  live: LiveAnswer;
  repositoryId: string;
  onFollowup: (question: string) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-8">
      {messages.map((message) =>
        message.role === "user" ? (
          <UserQuestion key={message.id} text={message.content} />
        ) : (
          <AssistantAnswer
            key={message.id}
            domPrefix={message.id}
            content={message.content}
            evidence={message.evidence ?? []}
            followups={message.followups ?? []}
            repositoryId={repositoryId}
            onFollowup={onFollowup}
            error={message.status === "error" ? "This answer didn't finish generating." : null}
          />
        ),
      )}

      {pendingQuestion !== null ? (
        <>
          <UserQuestion text={pendingQuestion} />
          <AssistantAnswer
            domPrefix="live"
            content={live.answer}
            evidence={live.evidence}
            followups={live.followups}
            repositoryId={repositoryId}
            onFollowup={onFollowup}
            streaming={live.streaming}
            phase={live.phase}
            error={live.error}
          />
        </>
      ) : null}
    </div>
  );
}

function UserQuestion({ text }: { text: string }) {
  return (
    <motion.h2
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="text-balance text-xl font-semibold tracking-tight text-ink-950 sm:text-2xl dark:text-ink-50"
    >
      {text}
    </motion.h2>
  );
}
