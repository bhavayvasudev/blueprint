"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { useEffect, useState } from "react";

/** A thin bar under the floating nav tracking scroll position — legal
 * documents are long enough that "how much is left" is worth answering
 * without making the reader guess from the scrollbar. */
export function ReadingProgress() {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: reduceMotion ? 1000 : 220,
    damping: 32,
    restDelta: 0.001,
  });

  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-40 h-0.5 origin-left bg-accent-500"
      aria-hidden="true"
    />
  );
}

export interface TocSection {
  id: string;
  title: string;
}

/** A scrollspy anchor nav — active section tracked via
 * `IntersectionObserver` rather than scroll-position math, so it stays
 * correct regardless of how tall each section ends up. */
export function TableOfContents({ sections }: { sections: TocSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Table of contents" className="sticky top-32 hidden shrink-0 lg:block">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400 dark:text-ink-500">
        On this page
      </p>
      <ul className="mt-3 flex w-48 flex-col gap-0.5 border-l border-ink-950/8 dark:border-white/10">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={active === section.id ? "location" : undefined}
              className={`block border-l-2 py-1.5 pl-3 text-sm transition-colors ${
                active === section.id
                  ? "border-accent-500 font-medium text-ink-950 dark:text-ink-50"
                  : "border-transparent text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200"
              }`}
            >
              {section.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
