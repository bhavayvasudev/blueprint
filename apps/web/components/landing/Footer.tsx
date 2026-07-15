"use client";

import { usePathname } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Surface } from "@blueprint/ui";
import { ScrollReveal } from "./ScrollReveal";
import { BlueprintMark, IconGitHub } from "@/components/workspace/icons";

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13.6 10.6 20.9 2h-1.7l-6.3 7.5L7.9 2H2l7.6 11-7.6 9h1.7l6.7-8 5.3 8h5.9l-7.9-11.4Zm-2.4 2.8-.8-1.1L4.5 3.3h2.6l5 7.1.8 1.1 6.5 9.3h-2.6l-5.2-7.4Z" />
    </svg>
  );
}

function IconLinkedIn({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5.3 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM3.6 9.3h3.4V21H3.6V9.3Zm6.5 0h3.3v1.6h.1c.5-.9 1.7-1.9 3.4-1.9 3.6 0 4.3 2.4 4.3 5.4V21h-3.4v-5.9c0-1.4 0-3.2-2-3.2s-2.3 1.5-2.3 3.1V21h-3.4V9.3Z" />
    </svg>
  );
}

const COLUMNS = [
  {
    label: "Product",
    links: [
      { label: "Features", href: "#features", anchor: true },
      { label: "How it works", href: "#how-it-works", anchor: true },
      { label: "Changelog", href: "/changelog", anchor: false },
    ],
  },
  {
    label: "Resources",
    links: [
      { label: "Docs", href: "/docs", anchor: false },
      { label: "API", href: "/api", anchor: false },
      { label: "GitHub", href: "https://github.com", anchor: false },
    ],
  },
  {
    label: "Company",
    links: [
      { label: "Privacy", href: "/privacy", anchor: false },
      { label: "Terms", href: "/terms", anchor: false },
      { label: "Contact", href: "/contact", anchor: false },
    ],
  },
] as const;

/** Local-only subscribe affordance — no backend endpoint exists yet, so
 * this confirms optimistically and goes no further; wiring a real
 * mailing-list call is a separate, explicit change. */
function NewsletterForm() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  if (submitted) {
    return <p className="text-sm text-ink-500 dark:text-ink-400">You&apos;re on the list.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xs gap-2">
      <label htmlFor="footer-email" className="sr-only">
        Email address
      </label>
      <input
        id="footer-email"
        type="email"
        required
        placeholder="you@company.com"
        className="w-full rounded-full border border-ink-950/10 bg-white/70 px-4 py-2 text-sm text-ink-950 outline-none placeholder:text-ink-400 focus-visible:border-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:border-white/10 dark:bg-ink-900/70 dark:text-ink-50 dark:placeholder:text-ink-500"
      />
      <Button type="submit" variant="primary" size="md" className="shrink-0">
        Join
      </Button>
    </form>
  );
}

export function Footer() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <footer className="relative z-10 px-6 pb-10 lg:px-12">
      <ScrollReveal className="mx-auto max-w-6xl">
        <Surface padding="lg" className="flex flex-col gap-12">
          <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
            <div className="flex max-w-xs flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <BlueprintMark className="size-7 text-accent-500" />
                <span className="text-base font-semibold tracking-tight text-ink-950 dark:text-ink-50">
                  Blueprint
                </span>
              </div>
              <p className="text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                The operating system for understanding software.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <a
                  href="https://github.com"
                  aria-label="Blueprint on GitHub"
                  className="flex size-9 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-950/5 hover:text-ink-950 dark:text-ink-400 dark:hover:bg-white/8 dark:hover:text-ink-50"
                >
                  <IconGitHub className="size-4.5" />
                </a>
                <a
                  href="https://x.com"
                  aria-label="Blueprint on X"
                  className="flex size-9 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-950/5 hover:text-ink-950 dark:text-ink-400 dark:hover:bg-white/8 dark:hover:text-ink-50"
                >
                  <IconX className="size-4" />
                </a>
                <a
                  href="https://linkedin.com"
                  aria-label="Blueprint on LinkedIn"
                  className="flex size-9 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-950/5 hover:text-ink-950 dark:text-ink-400 dark:hover:bg-white/8 dark:hover:text-ink-50"
                >
                  <IconLinkedIn className="size-4" />
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:gap-16">
              {COLUMNS.map((column) => (
                <div key={column.label} className="flex flex-col gap-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-400 dark:text-ink-500">
                    {column.label}
                  </span>
                  <ul className="flex flex-col gap-2.5">
                    {column.links.map((link) => (
                      <li key={link.label}>
                        <a
                          href={link.anchor && !isHome ? `/${link.href}` : link.href}
                          className="text-sm text-ink-600 transition-colors hover:text-ink-950 dark:text-ink-300 dark:hover:text-ink-50"
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 lg:max-w-xs">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-400 dark:text-ink-500">
                Stay in the loop
              </span>
              <p className="text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                Occasional notes on what we&apos;re building. No spam.
              </p>
              <NewsletterForm />
            </div>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 border-t border-ink-950/6 pt-6 sm:flex-row dark:border-white/8">
            <p className="text-xs text-ink-400 dark:text-ink-500">
              © {new Date().getFullYear()} Blueprint. All rights reserved.
            </p>
            <p className="text-xs text-ink-400 dark:text-ink-500">Built for developers who read code.</p>
          </div>
        </Surface>
      </ScrollReveal>
    </footer>
  );
}
