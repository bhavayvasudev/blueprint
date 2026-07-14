"use client";

import { motion } from "framer-motion";
import { Magnetic, Reveal } from "@blueprint/ui";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { AmbientBackground } from "./AmbientBackground";
import { BlueprintMark, IconGitHub } from "./icons";

/** Signed-out Blueprint. Not a marketing hero — an editorial statement
 * set against the workspace already alive behind it: the constellation
 * holds the right half of the stage, the words hold the left, and
 * signing in is stepping through. */
export function LandingStage({ signInHref }: { signInHref: string }) {
  return (
    <div className="relative flex min-h-dvh w-full flex-col overflow-hidden">
      <AmbientBackground />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 lg:px-12">
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

      {/* The composition is deliberately asymmetric: the statement owns
          the left, the living constellation owns the right, and the
          empty middle is what makes both read. */}
      <main className="relative z-10 flex flex-1 items-center px-6 pb-28 lg:px-12">
        <div className="flex w-full max-w-2xl flex-col items-start gap-8 lg:ml-[4vw]">
          <h1
            className="text-5xl font-semibold tracking-tight text-ink-950 sm:text-6xl xl:text-7xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            <Reveal delay={0.08} distance={36}>
              <span className="block">Software,</span>
            </Reveal>
            <Reveal delay={0.2} distance={36}>
              <span className="block">understood.</span>
            </Reveal>
          </h1>

          <Reveal delay={0.34}>
            <p className="max-w-md text-lg leading-relaxed text-ink-600 dark:text-ink-300">
              Blueprint reads your repository — every file, every import — and briefs you on the
              shape of what it finds.
            </p>
          </Reveal>

          <Reveal delay={0.46}>
            <Magnetic strength={0.3}>
              <motion.a
                href={signInHref}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 380, damping: 20 }}
                className="inline-flex items-center gap-2.5 rounded-full bg-accent-600 px-7 py-3.5 text-sm font-medium text-white shadow-lg shadow-accent-500/30 transition-[background-color,box-shadow] hover:bg-accent-700 hover:shadow-xl hover:shadow-accent-500/40"
              >
                <IconGitHub className="size-4.5" />
                Sign in with GitHub
              </motion.a>
            </Magnetic>
          </Reveal>

          <Reveal delay={0.58}>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              The operating system for understanding software.
            </p>
          </Reveal>
        </div>
      </main>
    </div>
  );
}
