"use client";

import { motion } from "framer-motion";
import type { Repository } from "@blueprint/shared-types";
import { Magnetic, Reveal, Tilt } from "@blueprint/ui";
import type { ModuleFacts } from "@/lib/insights";
import { AIBriefingCard } from "./AIBriefingCard";
import { AmbientBackground } from "./AmbientBackground";
import { GraphPreviewCard } from "./GraphPreviewCard";
import { RepositoryOverviewCard } from "./RepositoryOverviewCard";
import { IconGitHub } from "./icons";
import { LandingNav } from "@/components/landing/Nav";
import { FeatureShowcase } from "@/components/landing/FeatureShowcase";
import { ProductPreview } from "@/components/landing/ProductPreview";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ArchitectureExplorer } from "@/components/landing/ArchitectureExplorer";
import { AIConversation } from "@/components/landing/AIConversation";
import { RepositoryIntelligence } from "@/components/landing/RepositoryIntelligence";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

// Illustrative only — the hero renders the shape of a study, not a real
// one, built from the same types real data uses. The landing page's other
// worked-example sections (HowItWorks, RepositoryIntelligence, ProductPreview's
// Insights tab) say so explicitly on-page; every surface inside the
// authenticated product (Briefing, Atlas, Insights) shows exclusively real,
// sourced data.
const HERO_REPOSITORY: Repository = {
  id: "hero-demo",
  installation_id: "hero-demo",
  full_name: "blueprint/atlas-core",
  default_branch: "main",
  private: true,
  connection_status: "connected",
  last_synced_sha: "4f21ac9",
  last_synced_at: new Date().toISOString(),
};

const HERO_MODULES: ModuleFacts[] = [
  { id: "atlas", label: "Atlas", nodeType: "package", fileCount: 42, dependsOn: [], dependedOnBy: [], inCycle: false, ring: 0 },
  { id: "ingest", label: "Ingest", nodeType: "package", fileCount: 58, dependsOn: [{ id: "atlas", label: "Atlas" }], dependedOnBy: [], inCycle: false, ring: 1 },
  { id: "briefing", label: "Briefing", nodeType: "package", fileCount: 31, dependsOn: [{ id: "atlas", label: "Atlas" }], dependedOnBy: [], inCycle: false, ring: 1 },
  { id: "graph-engine", label: "Graph Engine", nodeType: "package", fileCount: 47, dependsOn: [{ id: "atlas", label: "Atlas" }], dependedOnBy: [], inCycle: false, ring: 1 },
  { id: "insights", label: "Insights", nodeType: "package", fileCount: 22, dependsOn: [{ id: "briefing", label: "Briefing" }], dependedOnBy: [], inCycle: false, ring: 2 },
  { id: "threads", label: "Threads", nodeType: "package", fileCount: 19, dependsOn: [{ id: "graph-engine", label: "Graph Engine" }], dependedOnBy: [], inCycle: false, ring: 2 },
  { id: "workspace-ui", label: "Workspace UI", nodeType: "package", fileCount: 63, dependsOn: [{ id: "briefing", label: "Briefing" }, { id: "insights", label: "Insights" }], dependedOnBy: [], inCycle: false, ring: 2 },
];


/** Signed-out Blueprint: a full-length premium landing page, not a
 * one-screen hero. The hero keeps its established asymmetric
 * composition (statement left, real product surfaces floating right);
 * everything below extends the same warm-monochrome-plus-one-accent
 * glass language section by section, ending in an FAQ, a final CTA,
 * and a complete footer. No pricing or testimonials — Blueprint is an
 * engineering tool, not a marketing product. */
export function LandingStage({ signInHref }: { signInHref: string }) {
  return (
    <div id="top" className="relative flex min-h-dvh w-full flex-col overflow-hidden">
      <AmbientBackground />

      <LandingNav signInHref={signInHref} />

      {/* The composition is deliberately asymmetric: the statement owns
          the left, and the right renders the product itself — real
          surfaces (the Atlas preview, the Overview, the Briefing),
          composed around the one object standing in for "a repository,
          understood." The scene only appears once there's room for
          both columns at their full width (xl+); below that, the
          statement has the page to itself instead of colliding with a
          scene that has nowhere to go. */}
      <main className="relative z-10 flex flex-1 items-center justify-between px-6 pt-28 pb-20 lg:px-12 lg:pt-32">
        <div className="flex w-full max-w-2xl flex-col items-start gap-8 xl:w-auto xl:max-w-xl xl:shrink-0">
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
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.96, y: 0 }}
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

        {/* The scene: one isometric shelf, not a pile — three real
            product cards, nothing decorative above them. Generous air
            on every side reads as considered rather than accidental.
            Every card stays fully opaque and clear of the statement on
            the left; where cards meet each other the gap is a
            deliberate 60-70px, never a corner touching a corner. The
            single Tilt wrapper turns the whole shelf together as one
            physical object under the cursor — depth comes from that
            shared tilt plus each plate's scale and shadow, not from
            stacking translucency. */}
        <Reveal delay={0.3} distance={28} className="relative hidden shrink-0 xl:block">
          <Tilt maxTilt={3} glare={false} className="hero-scene relative h-[660px] w-[560px]">
            <div className="pointer-events-none absolute inset-0">
              <div
                aria-hidden
                className="absolute left-1/2 top-[150px] h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
                style={{
                  opacity: "var(--glow-opacity)",
                  background: "radial-gradient(ellipse at center, var(--color-accent-500) 0%, transparent 70%)",
                }}
              />

              {/* Architecture Graph — the primary card, anchored to the
                  shelf's top-left corner. */}
              <div className="absolute left-0 top-[110px] z-20 w-[260px] -rotate-1">
                <GraphPreviewCard modules={HERO_MODULES} keystoneId="atlas" repositoryId="hero-demo" />
              </div>

              {/* Repository Overview — same shelf level, right edge
                  flush with the scene; a full 80px gap from the graph
                  card, never touching it. */}
              <div className="absolute right-0 top-[110px] z-20 w-[220px] rotate-1">
                <RepositoryOverviewCard
                  repository={HERO_REPOSITORY}
                  fileCount={1482}
                  moduleCount={HERO_MODULES.length}
                  importCount={918}
                  confidencePercent={96}
                />
              </div>

              {/* AI Briefing — set one plate back: smaller scale, a
                  clean gap below the top row instead of tucking under
                  it. */}
              <div
                className="absolute left-1/2 top-[460px] z-10 w-[280px] -translate-x-1/2 -rotate-1"
                style={{ scale: 0.97 }}
              >
                <AIBriefingCard claimCount={9} measuredCount={6} likelyCount={3} undeterminedCount={0} />
              </div>
            </div>
          </Tilt>
        </Reveal>
      </main>

      <FeatureShowcase />
      <HowItWorks />
      <ProductPreview />
      <ArchitectureExplorer />
      <AIConversation />
      <RepositoryIntelligence />
      <FAQ />
      <FinalCTA signInHref={signInHref} />
      <Footer />
    </div>
  );
}
