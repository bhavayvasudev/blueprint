"use client";

import { motion } from "framer-motion";
import { Float, Magnetic, Reveal } from "@blueprint/ui";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { AmbientBackground } from "./AmbientBackground";
import { BlueprintMark, IconGitHub } from "./icons";

/** Signed-out Blueprint. Not a marketing hero — the workspace is
 * already alive behind the glass: graph nodes orbit, light follows the
 * cursor, and signing in is stepping through. */
export function LandingStage({ signInHref }: { signInHref: string }) {
  return (
    <div className="relative flex min-h-dvh w-full flex-col overflow-hidden">
      <AmbientBackground />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 lg:px-10">
        <Reveal distance={12}>
          <div className="flex items-center gap-2.5">
            <BlueprintMark className="size-8 text-accent-500" />
            <span className="text-base font-semibold tracking-tight text-ink-950 dark:text-ink-50">
              Blueprint
            </span>
          </div>
        </Reveal>
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-9 px-6 pb-24 text-center">
        <Reveal distance={20}>
          <Float amplitude={10} duration={7}>
            <div className="glass-strong edge-light rounded-3xl p-5">
              <BlueprintMark className="size-14 text-accent-500" />
            </div>
          </Float>
        </Reveal>

        <h1 className="max-w-3xl text-5xl font-semibold leading-none tracking-tighter text-ink-950 dark:text-ink-50 xl:text-6xl">
          <Reveal delay={0.1} distance={36}>
            <span className="block">Understand. Architect.</span>
          </Reveal>
          <Reveal delay={0.22} distance={36}>
            <span className="text-aurora block pb-1">Build Better.</span>
          </Reveal>
        </h1>

        <Reveal delay={0.34}>
          <p className="max-w-xl text-lg text-ink-500 dark:text-ink-400">
            Blueprint doesn&apos;t summarize repositories — it cross-examines them. Connect a
            repository to see its real structure, not what the README claims it is.
          </p>
        </Reveal>

        <Reveal delay={0.46}>
          <Magnetic strength={0.3}>
            <motion.a
              href={signInHref}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 20 }}
              className="inline-flex items-center gap-2.5 rounded-full bg-ink-950 px-7 py-3.5 text-sm font-medium text-white shadow-lg shadow-accent-500/25 transition-shadow hover:shadow-xl hover:shadow-accent-500/40 dark:bg-white dark:text-ink-950"
            >
              <IconGitHub className="size-4.5" />
              Sign in with GitHub
            </motion.a>
          </Magnetic>
        </Reveal>

        <Reveal delay={0.58}>
          <p className="text-xs text-ink-400 dark:text-ink-500">
            The operating system for software architecture.
          </p>
        </Reveal>
      </main>
    </div>
  );
}
