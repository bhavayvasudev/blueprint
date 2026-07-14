"use client";

import { motion } from "framer-motion";
import { Magnetic, Surface } from "@blueprint/ui";
import { ScrollReveal } from "./ScrollReveal";
import { IconCheck, IconGitHub } from "@/components/workspace/icons";

const PLANS = [
  {
    name: "Foundation",
    price: "Free",
    cadence: "forever",
    description: "Study one repository and see whether Blueprint's read matches your own.",
    features: ["1 connected repository", "The Briefing and the Atlas", "Weekly re-indexing", "Community support"],
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$24",
    cadence: "per developer / month",
    description: "For the developer who owns a codebase's health, not just their own corner of it.",
    features: [
      "Unlimited repositories",
      "Insights and Threads",
      "Re-indexing on every push",
      "Priority indexing queue",
      "Email support",
    ],
    highlighted: true,
  },
  {
    name: "Teams",
    price: "Custom",
    cadence: "billed annually",
    description: "Roll Blueprint out across every repository your organization owns.",
    features: ["Everything in Pro", "SSO and audit logs", "Dedicated onboarding", "SLA-backed support"],
    highlighted: false,
  },
] as const;

export function Pricing({ signInHref }: { signInHref: string }) {
  return (
    <section id="pricing" className="relative z-10 scroll-mt-28 px-6 py-24 lg:px-12 lg:py-32">
      <div className="mx-auto max-w-5xl">
        <ScrollReveal className="mx-auto max-w-xl text-center">
          <h2
            className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl xl:text-5xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            Simple pricing, no fine print.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            Start on one repository for free. Upgrade when you want the whole workspace.
          </p>
        </ScrollReveal>

        <div className="mt-14 grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          {PLANS.map((plan, index) => (
            <ScrollReveal key={plan.name} delay={index * 0.08} distance={20}>
              <Surface
                padding="lg"
                className={`relative flex h-full flex-col gap-6 ${
                  plan.highlighted ? "ring-1 ring-accent-500/60 shadow-accent-500/10 shadow-xl lg:-translate-y-3" : ""
                }`}
              >
                {plan.highlighted ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-500 px-3 py-1 text-xs font-medium text-white">
                    Recommended
                  </span>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <h3 className="text-lg font-semibold text-ink-950 dark:text-ink-50">{plan.name}</h3>
                  <p className="text-sm leading-relaxed text-ink-500 dark:text-ink-400">{plan.description}</p>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tracking-tight text-ink-950 dark:text-ink-50">
                    {plan.price}
                  </span>
                  <span className="text-sm text-ink-500 dark:text-ink-400">{plan.cadence}</span>
                </div>

                <ul className="flex flex-1 flex-col gap-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-ink-700 dark:text-ink-300">
                      <IconCheck className="mt-0.5 size-4 shrink-0 text-accent-500" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Magnetic strength={0.15}>
                  <motion.a
                    href={plan.price === "Custom" ? "mailto:sales@blueprint.dev" : signInHref}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 380, damping: 20 }}
                    className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-colors ${
                      plan.highlighted
                        ? "bg-accent-500 text-white hover:bg-accent-600"
                        : "glass edge-light text-ink-700 hover:text-ink-950 dark:text-ink-300 dark:hover:text-ink-50"
                    }`}
                  >
                    {plan.price !== "Custom" ? <IconGitHub className="size-4" /> : null}
                    {plan.price === "Custom" ? "Talk to us" : "Connect GitHub"}
                  </motion.a>
                </Magnetic>
              </Surface>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
