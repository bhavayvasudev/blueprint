"use client";

import { motion } from "framer-motion";
import { Magnetic } from "@blueprint/ui";
import { ScrollReveal } from "./ScrollReveal";
import { IconGitHub } from "@/components/workspace/icons";

export function FinalCTA({ signInHref }: { signInHref: string }) {
  return (
    <section id="cta" className="relative z-10 px-6 py-28 lg:px-12 lg:py-36">
      <ScrollReveal className="mx-auto flex max-w-2xl flex-col items-center gap-8 text-center">
        <h2
          className="text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl xl:text-6xl dark:text-ink-50"
          style={{ textWrap: "balance" }}
        >
          Start understanding software.
        </h2>
        <p className="max-w-md text-lg leading-relaxed text-ink-500 dark:text-ink-400">
          Connect a repository. In minutes, you&apos;ll have a briefing you didn&apos;t write and can
          still defend.
        </p>
        <Magnetic strength={0.3}>
          <motion.a
            href={signInHref}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.96, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 20 }}
            className="inline-flex items-center gap-2.5 rounded-full bg-accent-600 px-8 py-4 text-base font-medium text-white shadow-lg shadow-accent-500/30 transition-[background-color,box-shadow] hover:bg-accent-700 hover:shadow-xl hover:shadow-accent-500/40"
          >
            <IconGitHub className="size-5" />
            Connect your GitHub
          </motion.a>
        </Magnetic>
      </ScrollReveal>
    </section>
  );
}
