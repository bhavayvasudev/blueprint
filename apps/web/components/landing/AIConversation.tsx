"use client";

import { Surface } from "@blueprint/ui";
import { ScrollReveal } from "./ScrollReveal";
import { ConfidenceMark } from "@/components/study/Confidence";

const REFERENCED_FILES = ["apps/api/auth/session.py", "apps/api/middleware/require_user.py", "apps/web/lib/auth-client.ts"];
const FUNCTIONS = ["verify_session()", "exchange_code()", "useCurrentUser()"];

export function AIConversation() {
  return (
    <section id="ai-conversation" className="relative z-10 scroll-mt-28 px-6 py-24 lg:px-12 lg:py-32">
      <div className="mx-auto max-w-4xl">
        <ScrollReveal className="mx-auto max-w-xl text-center">
          <h2
            className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl xl:text-5xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            Ask it anything about the code.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            Every answer traces to source — file, function, and how sure the architect is.
          </p>
        </ScrollReveal>

        <div className="mt-14 flex flex-col gap-4">
          <ScrollReveal delay={0.05}>
            <div className="ml-auto max-w-[85%] rounded-3xl rounded-br-md bg-ink-950 px-5 py-3.5 text-base text-white sm:max-w-[70%] dark:bg-white dark:text-ink-950">
              Where is authentication handled?
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.16}>
            <Surface padding="lg" className="mr-auto flex max-w-[92%] flex-col gap-6 rounded-3xl rounded-bl-md sm:max-w-[85%]">
              <p className="text-base leading-relaxed text-ink-700 dark:text-ink-300">
                I traced this through the import graph: the API verifies sessions in{" "}
                <span className="font-mono text-accent-600 dark:text-accent-400">auth/session.py</span>,
                which every protected route depends on through{" "}
                <span className="font-mono text-accent-600 dark:text-accent-400">require_user.py</span>.
                The web client mirrors that boundary in{" "}
                <span className="font-mono text-accent-600 dark:text-accent-400">auth-client.ts</span> —
                both sides trace back to the same GitHub App token exchange, so there&apos;s one
                authentication path, not two.
              </p>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="flex flex-col gap-2.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-400 dark:text-ink-500">
                    Referenced files
                  </span>
                  <ul className="flex flex-col gap-1.5">
                    {REFERENCED_FILES.map((f) => (
                      <li key={f} className="truncate font-mono text-sm text-ink-700 dark:text-ink-300">
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col gap-2.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-400 dark:text-ink-500">
                    Functions
                  </span>
                  <ul className="flex flex-col gap-1.5">
                    {FUNCTIONS.map((f) => (
                      <li key={f} className="truncate font-mono text-sm text-ink-700 dark:text-ink-300">
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-400 dark:text-ink-500">
                  Cited
                </span>
                <pre className="overflow-x-auto rounded-xl bg-ink-950/[0.035] p-4 font-mono text-xs leading-relaxed text-ink-700 dark:bg-white/[0.04] dark:text-ink-300">
{`# apps/api/auth/session.py
def verify_session(token: str) -> User:
    claims = decode(token, ...)
    return load_user(claims["sub"])`}
                </pre>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-ink-950/6 pt-4 dark:border-white/8">
                <ConfidenceMark confidence="measured" />
                <span className="text-xs text-ink-500 dark:text-ink-400">
                  Traced directly from the import graph
                </span>
              </div>
            </Surface>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
