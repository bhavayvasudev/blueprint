"use client";

import type { Repository, RepositoryStatus as GitHubStatus } from "@blueprint/shared-types";
import type { BadgeTone } from "@blueprint/ui";
import { Badge } from "@blueprint/ui";
import { motion, useReducedMotion } from "framer-motion";
import { use, type ComponentType, type ReactNode } from "react";
import { CountUp } from "@/components/landing/CountUp";
import {
  IconBranch,
  IconClock,
  IconCommit,
  IconEye,
  IconFork,
  IconIssue,
  IconScale,
  IconStar,
} from "@/components/workspace/icons";
import { healthStatusLabel } from "@/lib/insights";
import { timeAgo } from "@/lib/format";

const HEALTH_TONE: Record<ReturnType<typeof healthStatusLabel>, BadgeTone> = {
  Healthy: "ready",
  "Needs attention": "indexing",
  "Needs work": "failed",
};

interface IconProps {
  className?: string;
}

/** One metadata chip — a muted label and a strong value inside a glass
 * pill, matching the workspace's existing pill idiom (`glass edge-light
 * rounded-full`).
 *
 * Chips settle in staggered and lift 1px on hover. Both are at the quiet
 * end of RULES.md §17's ceiling: the stagger is a group of genuinely
 * new content arriving in order, and the lift is well under the 2–4px
 * cap for decorative hover. Nothing here loops or runs for spectacle. */
function Chip({
  label,
  icon: Icon,
  index,
  children,
}: {
  label: string;
  icon?: ComponentType<IconProps>;
  index: number;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 420,
        damping: 30,
        mass: 0.6,
        delay: reduceMotion ? 0 : index * 0.025,
      }}
      whileHover={reduceMotion ? undefined : { y: -1 }}
      className="glass edge-light inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-shadow duration-200 hover:shadow-sm"
    >
      {Icon ? <Icon className="size-3.5 text-ink-400 dark:text-ink-500" /> : null}
      <span className="text-ink-500 dark:text-ink-400">{label}</span>
      <span className="font-medium text-ink-900 dark:text-ink-100">{children}</span>
    </motion.span>
  );
}

/** Repository Status — everything true about this repository right now,
 * as one row of chips.
 *
 * Two sources, deliberately not separated in the layout because the
 * reader doesn't care which is which: what *this study* counted (files,
 * folders, modules, detected languages, the computed health read) and
 * what *GitHub* reports live (stars, forks, watchers, open issues,
 * license, tip commit). The GitHub half arrives as `github` and is simply
 * absent when the API couldn't be reached — chips disappear rather than
 * rendering zeroes, because "0 stars" and "we couldn't ask" are different
 * claims and only one of them would be true.
 *
 * Fields the brief listed that intentionally do *not* get their own chip,
 * because something here already carries them and duplicating would make
 * the row longer without making it say more:
 *
 * - **Visibility** is the leading Public/Private badge.
 * - **Default branch** is the Branch chip.
 * - **Primary language** is the head of the Languages chip, which shows
 *   the study's real detected mix; GitHub's single-language guess only
 *   fills in when the study detected nothing.
 * - **Last sync** is the "Last sync" chip — Blueprint's own last completed
 *   study, distinct from **Last commit**, which is GitHub's current tip.
 *   Those two genuinely differ (a study is only as fresh as its run), and
 *   seeing both is how you notice the study is behind the branch.
 * - **License** prefers GitHub's declared SPDX id over the doc audit's
 *   present/missing check, since "MIT" says strictly more than "Present".
 *
 * `github` arrives as a *promise* the page started and did not await, so
 * a slow or rate-limited GitHub never delays the study readout — this
 * component suspends alone, behind `RepositoryStatusSkeleton`, while the
 * rest of the Briefing is already on screen (RULES.md §5 holds: the page
 * still owns the fetch, it just hands over the promise instead of the
 * resolved value). */
export function RepositoryStatus({
  repository,
  github: githubPromise,
  fileCount,
  folderCount,
  moduleCount,
  languages,
  lastIndexedIso,
  commitSha,
  healthScore,
  licenseDetected,
}: {
  repository: Repository;
  github: Promise<GitHubStatus | null>;
  fileCount: number;
  folderCount: number;
  moduleCount: number;
  languages: string[];
  lastIndexedIso: string;
  commitSha: string | null;
  healthScore: number | null;
  licenseDetected: boolean;
}) {
  const github = use(githubPromise);
  const health = healthScore !== null ? healthStatusLabel(healthScore) : null;
  const license = github?.license_spdx_id ?? github?.license_name ?? null;
  // The study's detected mix leads; GitHub's single-language guess is the
  // fallback for a repository the study found no languages in.
  const languageLabel =
    languages.length > 0 ? languages.join(" · ") : (github?.primary_language ?? null);

  // One running index so the whole row staggers as a single sequence,
  // regardless of which chips a given repository actually has.
  let order = 0;
  const next = () => order++;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={repository.private ? "neutral" : "accent"}>
        {repository.private ? "Private" : "Public"}
      </Badge>
      {health ? (
        <Badge tone={HEALTH_TONE[health]}>
          {health}
          <span className="ml-1.5 font-mono text-[0.65rem] opacity-70">{healthScore}/100</span>
        </Badge>
      ) : null}

      {github ? (
        <>
          <Chip label="Stars" icon={IconStar} index={next()}>
            <CountUp value={github.stars} duration={0.9} />
          </Chip>
          <Chip label="Forks" icon={IconFork} index={next()}>
            <CountUp value={github.forks} duration={0.9} />
          </Chip>
          <Chip label="Watchers" icon={IconEye} index={next()}>
            <CountUp value={github.watchers} duration={0.9} />
          </Chip>
          {/* GitHub folds open PRs into this count and exposes no
              issues-only number; the label matches GitHub's own wording. */}
          <Chip label="Open issues" icon={IconIssue} index={next()}>
            <CountUp value={github.open_issues} duration={0.9} />
          </Chip>
        </>
      ) : null}

      <Chip label="Branch" icon={IconBranch} index={next()}>
        <span className="font-mono">{repository.default_branch}</span>
      </Chip>
      <Chip label="Files" index={next()}>
        {fileCount.toLocaleString()}
      </Chip>
      <Chip label="Folders" index={next()}>
        {folderCount.toLocaleString()}
      </Chip>
      <Chip label="Modules" index={next()}>
        {moduleCount.toLocaleString()}
      </Chip>
      {languageLabel ? (
        <Chip label="Languages" index={next()}>
          {languageLabel}
        </Chip>
      ) : null}
      <Chip label="License" icon={IconScale} index={next()}>
        {license ?? (licenseDetected ? "Present" : "None")}
      </Chip>

      {github?.last_commit_at ? (
        <Chip label="Last commit" icon={IconCommit} index={next()}>
          <span title={github.last_commit_message ?? undefined}>
            {timeAgo(github.last_commit_at)}
          </span>
        </Chip>
      ) : null}
      <Chip label="Last sync" icon={IconClock} index={next()}>
        {timeAgo(lastIndexedIso) ?? "just now"}
      </Chip>
      {commitSha ? (
        <Chip label="Studied" index={next()}>
          <span className="font-mono">{commitSha.slice(0, 7)}</span>
        </Chip>
      ) : null}
    </div>
  );
}

/** The status row's shape while GitHub is still answering — pill-shaped
 * bones at roughly the widths the real chips occupy, so the row doesn't
 * jump when they resolve. Chip-shaped rather than a generic bar, per the
 * house rule that a skeleton stands in for the content it replaces. */
export function RepositoryStatusSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-hidden="true">
      {[64, 96, 84, 88, 104, 92, 78, 96].map((width, index) => (
        <div
          key={index}
          className="skeleton-shimmer h-[30px] rounded-full bg-ink-100 dark:bg-ink-800"
          style={{ width }}
        />
      ))}
    </div>
  );
}
