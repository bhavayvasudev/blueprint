"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isSnapshotActive, type PipelineStage, type Snapshot } from "@blueprint/shared-types";
import { Button, ProportionBar, Reveal, Spinner, StatBlock, Text } from "@blueprint/ui";
import { IconWarning } from "@/components/workspace/icons";
import { useCancelStudy, useSnapshotPolling, useTriggerSync } from "@/lib/use-snapshot-polling";

// The exact stages `services/pipeline_runner.py` runs today
// (models.types.PipelineStage) — a direct mirror of that enum, in run order,
// not aspirational. No entry for "AI Executive Summary": nothing in the
// sync path generates one yet (see the Atlas's "Coming soon" card),
// so it never appears as a stage the pipeline pretends to run.
const STAGE_ORDER: PipelineStage[] = [
  "cloning",
  "discovering_files",
  "detecting_stack",
  "parsing",
  "detecting_routes",
  "persisting",
  "building_knowledge_graph",
  "building_repository_graph",
  "auditing_docs",
  "building_manifest",
  "indexing_docs",
  "indexing_code",
];

const STAGE_LABELS: Record<PipelineStage, string> = {
  cloning: "Connecting to GitHub",
  discovering_files: "Discovering files & mapping folders",
  detecting_stack: "Detecting languages & frameworks",
  parsing: "Parsing source",
  detecting_routes: "Discovering API routes",
  persisting: "Saving results",
  building_knowledge_graph: "Building the Knowledge Graph",
  building_repository_graph: "Building the Repository Graph",
  auditing_docs: "Auditing documentation",
  building_manifest: "Composing the repository manifest",
  // The two Stage 4 steps are what make the repository answerable in
  // Threads — worth naming as their own steps rather than hiding inside
  // "Saving results", since they are also the slowest and the ones whose
  // absence users actually feel.
  indexing_docs: "Indexing documentation for search",
  indexing_code: "Indexing source for search",
};

// Real, directly-counted numbers only (RULES.md §23) — filled in as each
// stage actually finishes, never estimated or interpolated.
const PROGRESS_LABELS: Record<string, string> = {
  files_discovered: "Files discovered",
  manifest_directories: "Manifests found",
  languages_detected: "Languages detected",
  frameworks_detected: "Frameworks detected",
  files_parsed: "Files parsed",
  symbols_parsed: "Symbols parsed",
  api_routes_discovered: "API routes discovered",
  knowledge_graph_nodes: "Knowledge Graph nodes",
  knowledge_graph_edges: "Knowledge Graph edges",
  repository_graph_nodes: "Modules mapped",
  repository_graph_edges: "Module relationships",
  docs_present: "Doc/hygiene checks present",
  docs_missing: "Doc/hygiene checks missing",
  doc_chunks_indexed: "Doc sections indexed",
  code_chunks_indexed: "Code symbols indexed",
};

function elapsedLabel(since: string, now: number): string {
  const totalSeconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function remainingLabel(seconds: number): string {
  if (seconds < 60) return `~${Math.max(5, Math.round(seconds / 5) * 5)}s`;
  const minutes = Math.round(seconds / 60);
  return `~${minutes}m`;
}

/** Live discoveries — real facts as they land, sourced directly from
 * `snapshot.progress`/`detected_stack`/`api_routes`/`doc_audit`, never a
 * scripted/fabricated toast feed. Each line traces to a real value on
 * the snapshot at this exact poll; nothing here is invented to fill
 * silence between stages. */
function useDiscoveries(snapshot: Snapshot): string[] {
  return useMemo(() => {
    const lines: string[] = [];
    const progress = snapshot.progress ?? {};

    if (progress.files_discovered) {
      lines.push(`${progress.files_discovered.toLocaleString()} files discovered`);
    }
    for (const lang of snapshot.detected_stack?.languages ?? []) {
      lines.push(`${lang.name} detected`);
    }
    for (const fw of snapshot.detected_stack?.frameworks ?? []) {
      lines.push(`${fw.name} detected`);
    }
    if (progress.symbols_parsed) {
      lines.push(`${progress.symbols_parsed.toLocaleString()} symbols parsed`);
    }
    if (snapshot.api_routes) {
      lines.push(
        snapshot.api_routes.count === 1
          ? "1 API endpoint indexed"
          : `${snapshot.api_routes.count.toLocaleString()} API endpoints indexed`,
      );
    }
    if (progress.repository_graph_nodes) {
      lines.push(`${progress.repository_graph_nodes.toLocaleString()} modules mapped`);
    }
    if (snapshot.doc_audit) {
      lines.push(
        `${snapshot.doc_audit.present.length} of ${
          snapshot.doc_audit.present.length + snapshot.doc_audit.missing.length
        } doc/hygiene checks present`,
      );
    }
    // Stage 4's landing facts. The README line is called out on its own
    // because it is the single document repository-level questions depend on
    // — "indexed 40 sections" reads as success even when the one that
    // mattered is missing.
    if (snapshot.index_status?.readme_indexed) {
      lines.push("README indexed and searchable");
    }
    if (progress.doc_chunks_indexed) {
      lines.push(`${progress.doc_chunks_indexed.toLocaleString()} doc sections made searchable`);
    }
    if (progress.code_chunks_indexed) {
      lines.push(`${progress.code_chunks_indexed.toLocaleString()} code symbols made searchable`);
    }
    return lines;
  }, [snapshot]);
}

/** The main-panel view of an in-progress or failed study — a real study
 * pipeline, not an opaque spinner: which of the 9 real stages is
 * running, real discoveries as they land, real counts, and (on
 * failure) why, with a way to retry. Shares its poll with `SyncTrigger`
 * via `useSnapshotPolling`'s query key. The ETA is a real historical
 * average over this repository's past studies (`estimated_total_seconds`,
 * `services/snapshot_service.py`) — never a fabricated countdown; on a
 * repository's first-ever study, that's stated plainly instead of
 * showing a number (PRODUCT.md's anti-"AI theater" stance, RULES.md
 * §23: no fabricated numbers). */
export function StudyProgress({
  repositoryId,
  initialSnapshot,
}: {
  repositoryId: string;
  initialSnapshot: Snapshot;
}) {
  const router = useRouter();
  const snapshotQuery = useSnapshotPolling(repositoryId, initialSnapshot);
  const syncMutation = useTriggerSync(repositoryId);
  const snapshot = snapshotQuery.data ?? initialSnapshot;
  const cancelMutation = useCancelStudy(repositoryId, snapshot.id);
  const [now, setNow] = useState(() => Date.now());

  const discoveries = useDiscoveries(snapshot);
  const isActive = isSnapshotActive(snapshot.status);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  if (snapshot.status === "queued") {
    // Waiting for a worker, and said as plainly as that. Every other
    // repository's study is irrelevant here except as the reason for the
    // wait, so the panel names the position and nothing else — no stage
    // list, because no stage is running, and no progress bar, because
    // there is no progress to report yet. A fabricated one would be
    // exactly the "AI theater" PRODUCT.md rules out.
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <Spinner size="sm" className="text-accent-500" />
          <Text size="lg" tone="secondary" className="leading-relaxed">
            Queued
            {snapshot.queue_position !== null ? ` · position #${snapshot.queue_position}` : ""}
          </Text>
        </div>
        <Text size="sm" tone="secondary">
          {snapshot.queue_position !== null && snapshot.queue_position > 1
            ? `Every worker is busy with another repository. ${snapshot.queue_position - 1} ${
                snapshot.queue_position - 1 === 1 ? "study is" : "studies are"
              } ahead of this one — it starts automatically as soon as a worker frees up.`
            : "Every worker is busy with another repository. This study starts automatically as soon as one frees up."}
          {" Waiting for "}
          {elapsedLabel(snapshot.created_at, now)}.
        </Text>
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          loading={cancelMutation.isPending}
          onClick={() => cancelMutation.mutate(undefined, { onSuccess: () => router.refresh() })}
        >
          Cancel this study
        </Button>
      </div>
    );
  }

  if (snapshot.status === "cancelled") {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <Text size="lg" tone="secondary" className="leading-relaxed">
          You cancelled this study before it finished.
        </Text>
        <Text size="sm" tone="secondary">
          Nothing was kept from the partial run — a half-read repository is not a briefing.
        </Text>
        <Button
          variant="primary"
          size="sm"
          className="w-fit"
          loading={syncMutation.isPending}
          onClick={() => syncMutation.mutate(undefined, { onSuccess: () => router.refresh() })}
        >
          Study it again
        </Button>
      </div>
    );
  }

  if (snapshot.status === "failed") {
    // `current_stage` is always cleared on failure (see
    // `pipeline_runner.py`'s except block) — the stage the run died in is
    // instead the prefix of `error_message` ("parsing: ...", "startup: ...").
    const failedStagePrefix = snapshot.error_message?.split(":")[0];
    const failedStageLabel =
      failedStagePrefix && failedStagePrefix in STAGE_LABELS
        ? STAGE_LABELS[failedStagePrefix as PipelineStage].toLowerCase()
        : null;
    const failureSummary =
      failedStagePrefix === "startup"
        ? "The study failed before the repository could even be reached."
        : failedStageLabel
          ? `The study failed while ${failedStageLabel}.`
          : "The study failed.";
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <Text size="lg" tone="secondary" className="leading-relaxed">
          {failureSummary}
        </Text>
        {snapshot.error_message ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-status-failed/20 bg-status-failed/[0.04] px-4 py-3 dark:border-status-failed/25 dark:bg-status-failed/[0.06]">
            <IconWarning className="mt-0.5 size-4 shrink-0 text-status-failed-deep dark:text-status-failed" />
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-status-failed-deep dark:text-status-failed">
              {snapshot.error_message}
            </pre>
          </div>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          className="w-fit"
          loading={syncMutation.isPending}
          onClick={() => syncMutation.mutate(undefined, { onSuccess: () => router.refresh() })}
        >
          Retry the study
        </Button>
      </div>
    );
  }

  const stageIndex = snapshot.current_stage ? STAGE_ORDER.indexOf(snapshot.current_stage) : -1;
  const counts = Object.keys(PROGRESS_LABELS).filter((key) => snapshot.progress?.[key] !== undefined);
  // Timed from when a worker actually claimed this study, not from when it
  // was enqueued. Under concurrency those differ by however long it queued,
  // and counting the wait as study time would both overstate how long the
  // repository took and make the ETA — which is measured over real work —
  // read as wrong.
  const studyStartedAt = snapshot.started_at ?? snapshot.created_at;
  const elapsedSeconds = Math.max(0, (now - new Date(studyStartedAt).getTime()) / 1000);
  const remainingSeconds =
    snapshot.estimated_total_seconds !== null
      ? Math.max(0, snapshot.estimated_total_seconds - elapsedSeconds)
      : null;

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <ProportionBar
          label="Studying the repository"
          count={Math.max(stageIndex, 0)}
          countLabel={stageIndex >= 0 ? `Step ${stageIndex + 1} of ${STAGE_ORDER.length}` : "Starting…"}
          total={STAGE_ORDER.length}
        />
        <Text size="sm" tone="secondary">
          Studying for {elapsedLabel(studyStartedAt, now)}
          {snapshot.stage_started_at && snapshot.current_stage
            ? ` — on "${STAGE_LABELS[snapshot.current_stage]}" for ${elapsedLabel(snapshot.stage_started_at, now)}`
            : ""}
          {remainingSeconds !== null
            ? ` — ${remainingLabel(remainingSeconds)} remaining, based on this repository's past studies`
            : " — first study of this repository, so no time estimate yet"}
        </Text>
      </div>

      <ol className="flex flex-col gap-2.5">
        {STAGE_ORDER.map((stage, index) => {
          const isDone = stageIndex >= 0 && index < stageIndex;
          const isCurrent = stage === snapshot.current_stage;
          const isConnectorDone = stageIndex >= 0 && index <= stageIndex;
          return (
            <li key={stage} className="relative flex items-center gap-3 text-sm">
              {index > 0 ? (
                <span
                  aria-hidden
                  className={`absolute left-2 -top-2.5 h-2.5 w-px transition-colors duration-300 ${
                    isConnectorDone ? "bg-status-ready/40" : "bg-ink-200 dark:bg-ink-700"
                  }`}
                />
              ) : null}
              <span
                aria-hidden
                className={`relative flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] transition-colors duration-300 ${
                  isDone
                    ? "bg-status-ready/15 text-status-ready-deep dark:text-status-ready"
                    : "bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500"
                }`}
              >
                {isCurrent ? <Spinner size="sm" className="text-accent-500" /> : isDone ? "✓" : ""}
              </span>
              <span
                className={
                  isCurrent
                    ? "font-medium text-ink-950 dark:text-ink-50"
                    : isDone
                      ? "text-ink-600 dark:text-ink-300"
                      : "text-ink-400 dark:text-ink-500"
                }
              >
                {STAGE_LABELS[stage]}
              </span>
            </li>
          );
        })}
      </ol>

      {discoveries.length > 0 ? (
        <Reveal>
          <div className="flex flex-col gap-3">
            <Text size="sm" tone="secondary" className="font-medium uppercase tracking-wide">
              Discovered so far
            </Text>
            <ul className="flex flex-col gap-1.5">
              {discoveries.map((line) => (
                <li
                  key={line}
                  className="flex items-baseline gap-2 text-sm text-ink-700 dark:text-ink-300"
                >
                  <span aria-hidden className="text-status-ready-deep dark:text-status-ready">
                    •
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      ) : null}

      {counts.length > 0 ? (
        <Reveal>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {counts.map((key) => (
              <StatBlock key={key} label={PROGRESS_LABELS[key]} value={snapshot.progress![key].toLocaleString()} />
            ))}
          </div>
        </Reveal>
      ) : null}
    </div>
  );
}
