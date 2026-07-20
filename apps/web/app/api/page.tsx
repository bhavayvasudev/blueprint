import type { Metadata } from "next";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { DocsSidebar } from "@/components/landing/DocsSidebar";
import { CodeBlock } from "@/components/landing/CodeBlock";
import { CodeTabs } from "@/components/landing/CodeTabs";
import { Callout } from "@/components/landing/Callout";
import { IconClock } from "@/components/workspace/icons";

export const metadata: Metadata = {
  title: "API — Blueprint",
  description: "A public API for Blueprint's knowledge graph is planned but not yet available.",
};

const GROUPS = [
  { id: "auth", title: "Authentication" },
  { id: "repositories", title: "Repositories" },
  { id: "modules", title: "Modules" },
  { id: "confidence", title: "Confidence" },
  { id: "sdks", title: "SDKs" },
] as const;

function MethodBadge({ method }: { method: "GET" }) {
  return (
    <span className="inline-flex items-center rounded-md bg-accent-500/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent-600 dark:bg-accent-400/15 dark:text-accent-400">
      {method}
    </span>
  );
}

function EndpointHeader({ method, path }: { method: "GET"; path: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MethodBadge method={method} />
      <code className="font-mono text-sm text-ink-800 dark:text-ink-200">{path}</code>
      <span className="rounded-full bg-ink-950/5 px-2 py-0.5 text-[11px] font-medium text-ink-400 dark:bg-white/8 dark:text-ink-500">
        planned
      </span>
    </div>
  );
}

export default function ApiPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl">
        <ScrollReveal>
          <p className="text-sm font-medium text-ink-500 dark:text-ink-400">API reference</p>
          <h1
            className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl xl:text-6xl dark:text-ink-50"
            style={{ textWrap: "balance" }}
          >
            Building the public API.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-500 dark:text-ink-400">
            Direct, programmatic access to the knowledge graph — modules, dependencies, confidence
            — the same data the workspace already computes.
          </p>
          <Callout tone="warning" title="Not live yet" className="mt-6 max-w-xl">
            Everything on this page describes the shape we&apos;re building toward. There is no
            live endpoint today — Blueprint is reachable through the workspace only.
          </Callout>
        </ScrollReveal>

        <div className="mt-16 flex flex-col gap-16 lg:flex-row lg:items-start lg:gap-16">
          <DocsSidebar sections={[...GROUPS]} />

          <div className="flex min-w-0 flex-1 flex-col gap-16 lg:max-w-2xl">
            <ScrollReveal>
              <section id="auth" className="scroll-mt-32">
                <h2 className="text-xl font-semibold text-ink-950 dark:text-ink-50">Authentication</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  Planned: API requests authenticate through the same GitHub App installation the
                  workspace already uses — no separate credential to provision. A request carries a
                  bearer token scoped to the repositories your installation covers.
                </p>
                <CodeTabs
                  className="mt-4"
                  tabs={[
                    {
                      label: "curl",
                      code: `curl https://api.blueprint.dev/v1/repositories \\\n  -H "Authorization: Bearer <token>"`,
                    },
                    {
                      label: "JavaScript",
                      code: `await fetch("https://api.blueprint.dev/v1/repositories", {\n  headers: { Authorization: \`Bearer \${token}\` },\n});`,
                    },
                    {
                      label: "Python",
                      code: `requests.get(\n    "https://api.blueprint.dev/v1/repositories",\n    headers={"Authorization": f"Bearer {token}"},\n)`,
                    },
                  ]}
                />
              </section>
            </ScrollReveal>

            <ScrollReveal delay={0.05}>
              <section id="repositories" className="scroll-mt-32">
                <h2 className="text-xl font-semibold text-ink-950 dark:text-ink-50">Repositories</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  The repositories your installation has granted access to, and their latest study.
                </p>
                <div className="mt-5 flex flex-col gap-3">
                  <EndpointHeader method="GET" path="/v1/repositories/{id}" />
                  <CodeBlock
                    label="200 response — shape only, not a live payload"
                    code={`{
  "id": "repo_9f2c",
  "full_name": "org/blueprint",
  "default_branch": "main",
  "private": true,
  "last_synced_at": "2026-07-18T09:14:00Z",
  "confidence_percent": 96
}`}
                  />
                </div>
              </section>
            </ScrollReveal>

            <ScrollReveal delay={0.05}>
              <section id="modules" className="scroll-mt-32">
                <h2 className="text-xl font-semibold text-ink-950 dark:text-ink-50">Modules</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  The parsed module graph — every module Blueprint found, and the dependency edges
                  between them.
                </p>

                <div className="mt-5 flex flex-col gap-3">
                  <EndpointHeader method="GET" path="/v1/repositories/{id}/modules" />
                  <CodeBlock
                    label="200 response — shape only, not a live payload"
                    code={`{
  "modules": [
    { "path": "src/graph/engine.ts", "language": "typescript", "in_degree": 14 },
    { "path": "src/graph/parser.ts", "language": "typescript", "in_degree": 6 }
  ]
}`}
                  />
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  <EndpointHeader method="GET" path="/v1/repositories/{id}/modules/{moduleId}/dependencies" />
                  <CodeTabs
                    tabs={[
                      {
                        label: "curl",
                        code: `curl https://api.blueprint.dev/v1/repositories/repo_9f2c/modules/mod_31/dependencies \\\n  -H "Authorization: Bearer <token>"`,
                      },
                      {
                        label: "JavaScript",
                        code: `await fetch(\n  "https://api.blueprint.dev/v1/repositories/repo_9f2c/modules/mod_31/dependencies",\n  { headers: { Authorization: \`Bearer \${token}\` } },\n);`,
                      },
                      {
                        label: "Python",
                        code: `requests.get(\n    "https://api.blueprint.dev/v1/repositories/repo_9f2c/modules/mod_31/dependencies",\n    headers={"Authorization": f"Bearer {token}"},\n)`,
                      },
                    ]}
                  />
                </div>
              </section>
            </ScrollReveal>

            <ScrollReveal delay={0.05}>
              <section id="confidence" className="scroll-mt-32">
                <h2 className="text-xl font-semibold text-ink-950 dark:text-ink-50">Confidence</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  The same measured / likely / undetermined grading the Briefing and Atlas already
                  show, as numbers.
                </p>
                <div className="mt-5 flex flex-col gap-3">
                  <EndpointHeader method="GET" path="/v1/repositories/{id}/confidence" />
                  <CodeBlock
                    label="200 response — shape only, not a live payload"
                    code={`{
  "measured_percent": 71,
  "likely_percent": 23,
  "undetermined_percent": 6,
  "parse_coverage_percent": 96
}`}
                  />
                </div>
              </section>
            </ScrollReveal>

            <ScrollReveal delay={0.05}>
              <section id="sdks" className="scroll-mt-32">
                <h2 className="text-xl font-semibold text-ink-950 dark:text-ink-50">SDKs</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  No client libraries are published yet. The endpoint shapes above are the contract
                  they&apos;ll wrap once the API itself ships — a thin typed client, not a
                  reimplementation of the workspace.
                </p>
              </section>
            </ScrollReveal>

            <ScrollReveal delay={0.1}>
              <div className="glass edge-light flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
                <span className="glass-strong edge-light flex size-11 items-center justify-center rounded-full text-accent-600 dark:text-accent-400">
                  <IconClock className="size-5" />
                </span>
                <h2 className="text-lg font-semibold text-ink-950 dark:text-ink-50">
                  Building something that needs this?
                </h2>
                <p className="max-w-md text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                  Tell us what you&apos;re trying to do and we&apos;ll factor it into how the API
                  takes shape.
                </p>
                <a
                  href="/contact"
                  className="mt-1 inline-flex items-center gap-2 rounded-full bg-ink-950 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent-500/25 transition-shadow hover:shadow-xl hover:shadow-accent-500/40 dark:bg-white dark:text-ink-950"
                >
                  Contact us
                </a>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
