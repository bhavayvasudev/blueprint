"use client";

import { motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Magnetic, Reveal } from "@blueprint/ui";
import { BlueprintMark, IconGitHub } from "@/components/workspace/icons";

const LINKS = [
  { hash: "#features", label: "Features" },
  { hash: "#how-it-works", label: "How It Works" },
];

/** The landing page's one piece of chrome — a floating glass pill, not a
 * hard bar, so it reads as the same "chrome floats, content doesn't
 * hide behind it" language the signed-in workspace uses. Anchors scroll
 * smoothly (`html { scroll-behavior: smooth }` in globals.css); each
 * target section carries `scroll-mt-28` so it never lands under the
 * pill. */
export function LandingNav({ signInHref }: { signInHref: string }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const homeHref = isHome ? "#top" : "/";
  const navItems = [
    ...LINKS.map((link) => ({
      key: link.hash,
      label: link.label,
      href: isHome ? link.hash : `/${link.hash}`,
    })),
    { key: "docs", label: "Docs", href: "/docs" },
  ];

  return (
    <Reveal distance={12} className="fixed inset-x-0 top-4 z-30 flex justify-center px-4 sm:top-6">
      <nav
        aria-label="Primary"
        className="glass edge-light flex w-full max-w-3xl items-center justify-between gap-4 rounded-full px-4 py-2.5 sm:px-5"
      >
        <motion.a
          href={homeHref}
          whileHover={reduceMotion ? undefined : { scale: 1.05 }}
          transition={{ type: "spring", stiffness: 380, damping: 20 }}
          className="flex shrink-0 items-center gap-2"
        >
          <BlueprintMark className="size-7 text-accent-500" />
          <span className="hidden text-sm font-semibold tracking-tight text-ink-950 sm:inline dark:text-ink-50">
            Blueprint
          </span>
        </motion.a>

        <ul
          className="hidden items-center gap-1 md:flex"
          onMouseLeave={() => setHovered(null)}
        >
          {navItems.map((link) => (
            <li key={link.key} className="relative">
              {hovered === link.key && (
                <motion.span
                  layoutId="nav-hover-pill"
                  className="absolute inset-0 rounded-full bg-ink-950/5 dark:bg-white/8"
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
                />
              )}
              <a
                href={link.href}
                onMouseEnter={() => setHovered(link.key)}
                onFocus={() => setHovered(link.key)}
                className="relative z-10 rounded-full px-3.5 py-1.5 text-sm font-medium text-ink-600 transition-colors hover:text-ink-950 dark:text-ink-300 dark:hover:text-ink-50"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle variant="flat" />
          <Magnetic strength={0.2}>
            <motion.a
              href={signInHref}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 20 }}
              className="inline-flex items-center gap-2 rounded-full bg-ink-950 px-3.5 py-1.5 text-xs font-medium text-white sm:px-4 sm:text-sm dark:bg-white dark:text-ink-950"
            >
              <IconGitHub className="size-3.5" />
              <span className="hidden sm:inline">Connect GitHub</span>
              <span className="sm:hidden">Connect</span>
            </motion.a>
          </Magnetic>
        </div>
      </nav>
    </Reveal>
  );
}
