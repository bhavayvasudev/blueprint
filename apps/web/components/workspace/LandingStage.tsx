"use client";

import { motion } from "framer-motion";
import type { Repository } from "@blueprint/shared-types";
import { Float, Magnetic, Reveal, Tilt } from "@blueprint/ui";
import type { ModuleFacts } from "@/lib/insights";
import { AIBriefingCard } from "./AIBriefingCard";
import { AmbientBackground } from "./AmbientBackground";
import { GraphPreviewCard } from "./GraphPreviewCard";
import { HeroArtifact } from "./HeroArtifact";
import { RepositoryOverviewCard } from "./RepositoryOverviewCard";
import { IconGitHub } from "./icons";
import { LandingNav } from "@/components/landing/Nav";
import { FeatureShowcase } from "@/components/landing/FeatureShowcase";
import { ProductPreview } from "@/components/landing/ProductPreview";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ArchitectureExplorer } from "@/components/landing/ArchitectureExplorer";
import { AIConversation } from "@/components/landing/AIConversation";
import { RepositoryIntelligence } from "@/components/landing/RepositoryIntelligence";
import { BlueprintInAction } from "@/components/landing/BlueprintInAction";
import { Pricing } from "@/components/landing/Pricing";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

// Illustrative only — the hero renders the shape of a study, not a real
// one. Every other surface in the product (Briefing, Atlas, Insights)
// shows exclusively real, sourced data; this is the one place a sample
// stands in, and it's built from the same types real data uses.
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

const HERO_BRIEFING_EXCERPT =
  "This repository is a knowledge graph engine with a Next.js workspace, organized around a single keystone module that every room — Briefing, Atlas, Insights, Threads — reads from.";

/** Signed-out Blueprint: a full-length premium landing page, not a
 * one-screen hero. The hero keeps its established asymmetric
 * composition (statement left, real product surfaces floating right);
 * everything below extends the same warm-monochrome-plus-one-accent
 * glass language section by section, ending in pricing, FAQ, a final
 * CTA, and a complete footer. */
export function LandingStage({ signInHref }: { signInHref: string }) {
  return (
    <div id="top" className="relative flex min-h-dvh w-full flex-col overflow-hidden">
      <AmbientBackground />

      <LandingNav signInHref={signInHref} />

      {/* The composition is deliberately asymmetric: the statement owns
          the left, and the right renders the product itself — real
          surfaces (the Atlas preview, the Overview, the Briefing),
          stacked around the one object standing in for "a repository,
          understood." */}
      <main className="relative z-10 flex flex-1 items-center justify-between px-6 pt-28 pb-20 lg:px-12 lg:pt-32">
        <div className="flex w-full max-w-2xl flex-col items-start gap-8 lg:w-auto lg:shrink-0">
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

        {/* The scene: a diorama, not a dashboard — everything past this
            point is pointer-events-none except the single Tilt wrapper,
            which turns the whole stack together as one physical object
            under the cursor. Nothing here is a second navigation. */}
        <Reveal delay={0.3} distance={28} className="relative hidden shrink-0 lg:block">
          <Tilt maxTilt={3.5} glare={false} className="relative h-[560px] w-[500px]">
            <div className="pointer-events-none absolute inset-0">
              <div
                aria-hidden
                className="absolute left-1/2 top-[48%] h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
                style={{
                  opacity: "var(--glow-opacity)",
                  background: "radial-gradient(ellipse at center, var(--color-accent-500) 0%, transparent 70%)",
                }}
              />

              <Float
                amplitude={16}
                duration={9}
                className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2"
              >
                <HeroArtifact />
              </Float>

              <Float amplitude={10} duration={7.5} className="absolute left-0 top-0 w-[280px] -rotate-2">
                <GraphPreviewCard modules={HERO_MODULES} keystoneId="atlas" repositoryId="hero-demo" />
              </Float>

              <Float
                amplitude={12}
                duration={8.5}
                delay={1.1}
                className="absolute right-0 top-[36%] w-[248px] rotate-1"
              >
                <RepositoryOverviewCard
                  repository={HERO_REPOSITORY}
                  fileCount={1482}
                  moduleCount={HERO_MODULES.length}
                  importCount={918}
                  confidencePercent={96}
                />
              </Float>

              <Float
                amplitude={9}
                duration={8}
                delay={0.6}
                className="absolute bottom-0 right-[6%] w-[270px] -rotate-1"
              >
                <AIBriefingCard excerpt={HERO_BRIEFING_EXCERPT} hasMore />
              </Float>
            </div>
          </Tilt>
        </Reveal>
      </main>

      <FeatureShowcase />
      <ProductPreview />
      <HowItWorks />
      <ArchitectureExplorer />
      <AIConversation />
      <RepositoryIntelligence />
      <BlueprintInAction />
      <Pricing signInHref={signInHref} />
      <FAQ />
      <FinalCTA signInHref={signInHref} />
      <Footer />
    </div>
  );
}
