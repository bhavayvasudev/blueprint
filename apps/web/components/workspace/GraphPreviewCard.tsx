"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { Surface, Tilt } from "@blueprint/ui";
import type { ModuleFacts } from "@/lib/insights";
import { IconArrowRight } from "./icons";

/** A small, honest preview of the Atlas — real module positions (ring
 * distance from the keystone, same axis the full graph uses), just
 * fewer of them and nothing interactive. The point is legibility at a
 * glance and a door into the real thing, not a second graph engine. */
export function GraphPreviewCard({
  modules,
  keystoneId,
  repositoryId,
}: {
  modules: ModuleFacts[];
  keystoneId: string | null;
  repositoryId: string;
}) {
  const reduceMotion = useReducedMotion();
  const preview = [...modules]
    .sort((a, b) => a.ring - b.ring)
    .slice(0, 9);
  const maxRing = Math.max(1, ...preview.map((module) => module.ring));

  const positioned = preview.map((module, index) => {
    const isKeystone = module.id === keystoneId;
    const ring = isKeystone ? 0 : Math.max(1, module.ring);
    const radius = (ring / (maxRing || 1)) * 68;
    const siblingsAtRing = preview.filter((m) => Math.max(1, m.ring) === ring).length || 1;
    const angleIndex = preview.filter((m, i) => i < index && Math.max(1, m.ring) === ring).length;
    const angle = (angleIndex / siblingsAtRing) * Math.PI * 2 + ring * 0.6;
    return {
      module,
      isKeystone,
      x: 50 + radius * Math.cos(angle),
      y: 50 + radius * Math.sin(angle),
    };
  });

  return (
    <Tilt maxTilt={3}>
      <Surface padding="md" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink-950 dark:text-ink-50">Architecture Graph</h3>
          <span className="flex items-center gap-1.5 text-xs text-status-ready-deep dark:text-status-ready">
            <span className="size-1.5 rounded-full bg-status-ready" />
            Live
          </span>
        </div>

        <div className="relative h-40 w-full overflow-hidden rounded-xl bg-ink-950/[0.025] dark:bg-white/[0.03]">
          <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
            {positioned.map(({ module, x, y }) =>
              module.dependsOn.slice(0, 2).map((dep, depIndex) => {
                const target = positioned.find((p) => p.module.id === dep.id);
                if (!target) return null;
                return (
                  <motion.line
                    key={`${module.id}-${dep.id}`}
                    x1={x}
                    y1={y}
                    x2={target.x}
                    y2={target.y}
                    stroke="currentColor"
                    strokeWidth="0.4"
                    className="text-ink-950/15 dark:text-white/15"
                    initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.05 * depIndex, ease: [0.22, 1, 0.36, 1] }}
                  />
                );
              }),
            )}
            {positioned.map(({ module, isKeystone, x, y }) => (
              <g key={module.id}>
                {isKeystone && !reduceMotion ? (
                  <circle
                    cx={x}
                    cy={y}
                    r={3.2}
                    fill="none"
                    stroke="var(--color-accent-500)"
                    strokeWidth="0.4"
                    className="graph-node-ripple"
                  />
                ) : null}
                <motion.circle
                  cx={x}
                  cy={y}
                  r={isKeystone ? 3.2 : 2}
                  fill={isKeystone ? "var(--color-accent-500)" : "currentColor"}
                  className={
                    isKeystone
                      ? reduceMotion
                        ? ""
                        : "graph-node-pulse"
                      : "text-ink-950/40 dark:text-white/40"
                  }
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.4, delay: 0.3 }}
                />
              </g>
            ))}
          </svg>
        </div>

        <Link
          href={`/repo/${repositoryId}`}
          className="group inline-flex w-fit items-center gap-1.5 text-sm font-medium text-accent-600 transition-colors hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-200"
        >
          Open the Atlas
          <IconArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
        </Link>
      </Surface>
    </Tilt>
  );
}
