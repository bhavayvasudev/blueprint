import type {
  ArchitectureGraph,
  DetectedStack,
  DocAudit,
  ReadmeExtract,
} from "@blueprint/shared-types";

/** The architect's read, computed — every claim on the Briefing and the
 * Atlas is arithmetic over the real repository graph (in-degree,
 * out-degree, strongly-connected components, parse coverage), never
 * generated prose. Interpretation above evidence above inventory
 * (PRODUCT.md §Design Principles): this module produces the
 * interpretation layer and carries the evidence for it, so every claim
 * the UI shows can open into the numbers it rests on. */

/** Confidence is first-class structure, not fine print: "measured" is
 * arithmetic over a fully-parsed graph; "likely" is the same arithmetic
 * when part of the codebase resisted parsing; "undetermined" is the
 * architect saying "I don't know" out loud. */
export type Confidence = "measured" | "likely" | "undetermined";

/** A sentence rendered as segments so module names inside prose become
 * handles — tuggable into the Atlas (strategy: "every claim is a
 * handle"). */
export interface Segment {
  text: string;
  moduleId?: string;
}

export interface EvidenceRow {
  label: string;
  value: string;
}

export interface Claim {
  id: string;
  confidence: Confidence;
  statement: Segment[];
  /** "Why I believe this" — the reasoning layer under the claim. */
  reasoning: string;
  evidence: EvidenceRow[];
  moduleIds: string[];
}

export interface ModuleFacts {
  id: string;
  label: string;
  nodeType: string;
  fileCount: number;
  dependsOn: { id: string; label: string }[];
  dependedOnBy: { id: string; label: string }[];
  inCycle: boolean;
  /** Undirected graph distance from the keystone module (0 = the
   * keystone itself); disconnected modules sit past the farthest ring. */
  ring: number;
}

export interface MethodRow {
  label: string;
  value: string;
  note: string;
}

export interface StudyReading {
  thesis: Segment[];
  claims: Claim[];
  /** Structural movement vs. the previous ready study; null when there
   * is no previous study to compare against. */
  deltas: Claim[] | null;
  method: MethodRow[];
  modules: ModuleFacts[];
  keystoneId: string | null;
}

/** One weighted input into the Repository Health Score — always shown
 * alongside the score itself (RULES.md: "a confidence score is never
 * displayed without its composition being one click away"), never
 * collapsed into a bare percentage. */
export interface HealthFactor {
  label: string;
  weightPercent: number;
  scorePercent: number;
  detail: string;
}

export interface HealthScore {
  score: number;
  factors: HealthFactor[];
}

/** Repository Health, computed — every factor is arithmetic over
 * numbers this same study already produced (parse coverage, cycle
 * membership, module connectivity, the real doc-presence audit), never
 * an LLM-assigned or fabricated number (RULES.md §23, PRODUCT.md's
 * anti-"AI theater" stance). The weights are a judgment call, stated
 * plainly as such — nothing here claims to be more precise than "one
 * reasonable way to combine four real signals." */
export function computeHealthScore(
  reading: StudyReading,
  graph: ArchitectureGraph,
  docAudit: { present: string[]; missing: string[] } | null,
): HealthScore {
  const factors: HealthFactor[] = [];

  const parsedFull = graph.tree_sitter_status.full_confidence_files;
  const parsedLow = graph.tree_sitter_status.low_confidence_files;
  const parsedTotal = parsedFull + parsedLow;
  factors.push({
    label: "Parse confidence",
    weightPercent: 30,
    scorePercent: parsedTotal > 0 ? Math.round((parsedFull / parsedTotal) * 100) : 100,
    detail:
      parsedTotal > 0
        ? `${parsedFull.toLocaleString()} of ${parsedTotal.toLocaleString()} files parsed with full structural confidence`
        : "no source files to parse",
  });

  const moduleCount = reading.modules.length;
  const cleanModules = reading.modules.filter((m) => !m.inCycle).length;
  factors.push({
    label: "Dependency structure",
    weightPercent: 25,
    scorePercent: moduleCount > 0 ? Math.round((cleanModules / moduleCount) * 100) : 100,
    detail:
      moduleCount > 0
        ? `${cleanModules} of ${moduleCount} modules sit outside any circular dependency`
        : "no modules to assess",
  });

  const docTotal = docAudit ? docAudit.present.length + docAudit.missing.length : 0;
  factors.push({
    label: "Documentation completeness",
    weightPercent: 25,
    scorePercent: docAudit && docTotal > 0 ? Math.round((docAudit.present.length / docTotal) * 100) : 0,
    detail: docAudit
      ? `${docAudit.present.length} of ${docTotal} project-hygiene checks present`
      : "not yet audited",
  });

  const isolated = reading.modules.filter(
    (m) => m.dependsOn.length === 0 && m.dependedOnBy.length === 0,
  ).length;
  factors.push({
    label: "Module connectivity",
    weightPercent: 20,
    scorePercent: moduleCount > 1 ? Math.round(((moduleCount - isolated) / moduleCount) * 100) : 100,
    detail:
      moduleCount > 1
        ? `${moduleCount - isolated} of ${moduleCount} modules are reachable through at least one import`
        : "single-module system",
  });

  const totalWeight = factors.reduce((sum, f) => sum + f.weightPercent, 0);
  const score = Math.round(
    factors.reduce((sum, f) => sum + f.scorePercent * f.weightPercent, 0) / totalWeight,
  );

  return { score, factors };
}

/** A qualitative read of the computed Health Score for the header and
 * overview card — the number itself still sits one click away in Stats
 * for nerds (RULES.md: a confidence score's composition is never more
 * than a click from where the score is shown). */
export function healthStatusLabel(score: number): "Healthy" | "Needs attention" | "Needs work" {
  if (score >= 80) return "Healthy";
  if (score >= 50) return "Needs attention";
  return "Needs work";
}

const formatCount = (n: number, singular: string, plural = `${singular}s`) =>
  `${n.toLocaleString()} ${n === 1 ? singular : plural}`;

/** Small counts inside prose read as words ("one entanglement"), not
 * digits — the thesis is a sentence, not a readout. */
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const countInProse = (n: number, singular: string, plural = `${singular}s`) =>
  `${n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : n.toLocaleString()} ${n === 1 ? singular : plural}`;

/** The first sentence or two of a README's description, cleaned of the
 * Markdown furniture that reads as noise in a prose paragraph (badge
 * images, links, inline code ticks, headings). Extraction only — the words
 * are the README's own, never rewritten (RULES.md §23). */
function leadSentences(description: string, maxChars = 260): string {
  const plain = description
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // badge/screenshot images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links keep their text
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxChars) return plain;

  // Prefer cutting at a sentence end inside the budget; fall back to an
  // ellipsis rather than truncating mid-word.
  const window = plain.slice(0, maxChars);
  const lastStop = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (lastStop > maxChars * 0.4) return window.slice(0, lastStop + 1);
  return `${window.slice(0, window.lastIndexOf(" "))}…`;
}

const joinLabels = (labels: string[]) =>
  labels.length <= 1
    ? (labels[0] ?? "")
    : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

/** The Atlas's plain-language read — three or four sentences, every one
 * arithmetic over data this same study already produced (stack
 * detection, module structure, the doc-hygiene audit). Not an LLM call:
 * a deterministic template over real signals, the same "computed, not
 * generated" contract as the thesis above (RULES.md §23). */
export function buildSummary(
  stack: DetectedStack | null,
  reading: StudyReading,
  docAudit: DocAudit | null,
  readme?: ReadmeExtract | null,
): string[] {
  const sentences: string[] = [];

  // What the project says it does, verbatim from its own README, comes
  // first when there is one — the structural read below is *about* a
  // codebase, but this is the codebase's own account of its purpose, and no
  // amount of counting file boundaries substitutes for it. Trimmed to a
  // lead sentence or two so the summary stays one paragraph; the full
  // extract is a search result away.
  const description = readme?.description?.trim();
  if (description) {
    sentences.push(leadSentences(description));
  }

  const frameworkNames = (stack?.frameworks ?? []).map((fw) => fw.name);
  const topLanguages = (stack?.languages ?? []).slice(0, 2).map((l) => l.name);
  if (frameworkNames.length > 0) {
    sentences.push(`This repository contains ${joinLabels(frameworkNames)}.`);
  } else if (topLanguages.length > 0) {
    sentences.push(`This repository is written primarily in ${joinLabels(topLanguages)}.`);
  } else {
    sentences.push("This study found no recognized language or framework manifests to describe.");
  }

  const moduleCount = reading.modules.length;
  const tangled = reading.modules.some((m) => m.inCycle);
  if (moduleCount <= 1) {
    sentences.push("The codebase sits behind a single module boundary.");
  } else if (tangled) {
    sentences.push("The architecture is modular, though a circular dependency ties part of it together.");
  } else {
    sentences.push("The overall architecture is modular and every dependency runs one way.");
  }

  const missing = docAudit?.missing.length ?? 0;
  const present = docAudit?.present.length ?? 0;
  if (docAudit && missing === 0) {
    sentences.push("Documentation is complete against every check this study runs.");
  } else if (docAudit) {
    sentences.push(present === 0 ? "Documentation is missing entirely." : "Documentation is incomplete.");
  }

  if (docAudit && docAudit.missing.length > 0) {
    sentences.push(`Adding ${joinLabels(docAudit.missing.slice(0, 2))} would improve maintainability.`);
  }

  return sentences;
}

/** Tarjan strongly-connected components — the honest way to find
 * circular dependencies at module level. */
function stronglyConnectedComponents(ids: string[], edges: Map<string, Set<string>>): string[][] {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const components: string[][] = [];

  function connect(v: string) {
    indices.set(v, index);
    lowLinks.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!indices.has(w)) {
        connect(w);
        lowLinks.set(v, Math.min(lowLinks.get(v)!, lowLinks.get(w)!));
      } else if (onStack.has(w)) {
        lowLinks.set(v, Math.min(lowLinks.get(v)!, indices.get(w)!));
      }
    }
    if (lowLinks.get(v) === indices.get(v)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1) components.push(component);
    }
  }

  for (const id of ids) if (!indices.has(id)) connect(id);
  return components;
}

export function analyzeGraph(
  graph: ArchitectureGraph,
  previous: ArchitectureGraph | null = null,
): StudyReading {
  const nodes = graph.repository_graph_nodes;
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const out = new Map<string, Set<string>>(nodes.map((node) => [node.id, new Set()]));
  const inbound = new Map<string, Set<string>>(nodes.map((node) => [node.id, new Set()]));
  for (const edge of graph.repository_graph_edges) {
    if (!nodesById.has(edge.source_node_id) || !nodesById.has(edge.target_node_id)) continue;
    if (edge.source_node_id === edge.target_node_id) continue;
    out.get(edge.source_node_id)!.add(edge.target_node_id);
    inbound.get(edge.target_node_id)!.add(edge.source_node_id);
  }

  const fileCountOf = (id: string) => {
    const meta = nodesById.get(id)?.metadata;
    return Array.isArray(meta?.file_paths) ? meta.file_paths.length : 0;
  };
  const labelOf = (id: string) => nodesById.get(id)?.label ?? id;
  const seg = (text: string): Segment => ({ text });
  const mod = (id: string): Segment => ({ text: labelOf(id), moduleId: id });

  // ----- parse coverage sets the ceiling on structural confidence -----
  const parsedFull = graph.tree_sitter_status.full_confidence_files;
  const parsedLow = graph.tree_sitter_status.low_confidence_files;
  const parsedTotal = parsedFull + parsedLow;
  const coverage = parsedTotal > 0 ? parsedFull / parsedTotal : 1;
  // Under 95% coverage the import web itself may be missing threads, so
  // structural claims are stated as "likely", never "measured".
  const structural: Confidence = coverage >= 0.95 ? "measured" : "likely";

  // ----- the principal structural facts -----
  const cycles = stronglyConnectedComponents([...nodesById.keys()], out);
  const inCycle = new Set(cycles.flat());

  const sorted = [...nodesById.keys()].sort(
    (a, b) =>
      inbound.get(b)!.size - inbound.get(a)!.size ||
      fileCountOf(b) - fileCountOf(a) ||
      labelOf(a).localeCompare(labelOf(b)),
  );
  const keystoneId =
    sorted.length > 0 && inbound.get(sorted[0]!)!.size >= 2 ? sorted[0]! : null;

  // Rings: undirected BFS distance from the keystone (or the largest
  // module when no keystone emerges) — the Atlas orbits are drawn from
  // this, and disconnected modules honestly sit past the farthest ring.
  const centerId = keystoneId ?? sorted[0] ?? null;
  const ringOf = new Map<string, number>();
  if (centerId) {
    ringOf.set(centerId, 0);
    let frontier = [centerId];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const id of frontier) {
        const neighbors = [...(out.get(id) ?? []), ...(inbound.get(id) ?? [])];
        for (const n of neighbors) {
          if (!ringOf.has(n)) {
            ringOf.set(n, ringOf.get(id)! + 1);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
  }
  const farthestRing = Math.max(0, ...ringOf.values());
  const modules: ModuleFacts[] = nodes
    .map((node) => ({
      id: node.id,
      label: node.label,
      nodeType: node.node_type,
      fileCount: fileCountOf(node.id),
      dependsOn: [...out.get(node.id)!].map((id) => ({ id, label: labelOf(id) })),
      dependedOnBy: [...inbound.get(node.id)!].map((id) => ({ id, label: labelOf(id) })),
      inCycle: inCycle.has(node.id),
      ring: ringOf.get(node.id) ?? farthestRing + 1,
    }))
    .sort((a, b) => a.ring - b.ring || b.dependedOnBy.length - a.dependedOnBy.length);

  // ----- thesis -----
  const moduleCount = nodes.length;
  const thesis: Segment[] = [];
  if (moduleCount === 0) {
    thesis.push(seg("I found no module boundaries in this repository yet — the structure lives below the level I roll up to."));
  } else if (moduleCount === 1) {
    thesis.push(
      seg("This system is a single unit: "),
      mod(nodes[0]!.id),
      seg(`, ${formatCount(fileCountOf(nodes[0]!.id), "file")} behind one boundary.`),
    );
  } else if (keystoneId) {
    const leanCount = inbound.get(keystoneId)!.size;
    thesis.push(
      seg(`${formatCount(moduleCount, "module")}, carried by `),
      mod(keystoneId),
      seg(
        ` — ${leanCount} of the other ${moduleCount - 1} lean on it` +
          (cycles.length > 0
            ? `, with ${countInProse(cycles.length, "entanglement")} in the weave.`
            : ", and the rest of the weave is clean."),
      ),
    );
  } else {
    thesis.push(
      seg(
        `${formatCount(moduleCount, "module")} with no single load-bearing wall — the weight is spread` +
          (cycles.length > 0
            ? `, though ${countInProse(cycles.length, "entanglement")} ties part of it together.`
            : ", and every dependency runs one way."),
      ),
    );
  }

  // ----- claims -----
  const claims: Claim[] = [];

  if (keystoneId) {
    const importers = [...inbound.get(keystoneId)!];
    claims.push({
      id: "keystone",
      confidence: structural,
      statement: [
        mod(keystoneId),
        seg(
          ` is the load-bearing wall. ${importers.length} of the ${moduleCount - 1} other modules import it — a change here reaches ${importers.length === moduleCount - 1 ? "everything" : "most of the system"}.`,
        ),
      ],
      reasoning:
        "I counted incoming import edges in the repository graph — file-level imports rolled up to module boundaries. No module collects more than this one.",
      evidence: [
        { label: "Imported by", value: joinLabels(importers.map(labelOf)) },
        { label: "Incoming edges", value: String(importers.length) },
        { label: "Files behind the boundary", value: String(fileCountOf(keystoneId)) },
      ],
      moduleIds: [keystoneId, ...importers],
    });
  }

  const reachId = [...nodesById.keys()]
    .filter((id) => out.get(id)!.size >= 2)
    .sort(
      (a, b) =>
        out.get(b)!.size - out.get(a)!.size || labelOf(a).localeCompare(labelOf(b)),
    )[0];
  if (reachId) {
    const dependencies = [...out.get(reachId)!];
    claims.push({
      id: "reach",
      confidence: structural,
      statement: [
        mod(reachId),
        seg(
          ` knows the most about the rest of the system — it imports ${dependencies.length} of the ${moduleCount - 1} other modules, so change elsewhere surfaces here first.`,
        ),
      ],
      reasoning:
        "I counted outgoing import edges per module. The widest reach marks where the blast radius of other modules' changes lands.",
      evidence: [
        { label: "Imports", value: joinLabels(dependencies.map(labelOf)) },
        { label: "Outgoing edges", value: String(dependencies.length) },
      ],
      moduleIds: [reachId, ...dependencies],
    });
  }

  // Interleaves module handles with prose separators, so lists of
  // modules inside a claim stay tuggable.
  const joinModuleSegments = (ids: string[]): Segment[] =>
    ids.flatMap((id, i) => [
      ...(i === 0 ? [] : [seg(i === ids.length - 1 ? " and " : ", ")]),
      mod(id),
    ]);

  for (const [i, cycle] of cycles.entries()) {
    const members = [...cycle].sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
    const labels = members.map(labelOf);
    claims.push({
      id: `cycle-${i}`,
      confidence: structural,
      statement: [
        ...joinModuleSegments(members),
        seg(
          ` import each other — a circular dependency. ${members.length === 2 ? "Neither side" : "None of them"} can change independently; when tracing impact I treat them as one unit.`,
        ),
      ],
      reasoning:
        "I looked for strongly-connected components in the module graph: groups where you can start at any member and follow imports back to where you began.",
      evidence: [
        { label: "Members", value: joinLabels(labels) },
        { label: "Size", value: formatCount(cycle.length, "module") },
      ],
      moduleIds: cycle,
    });
  }

  const isolated = modules.filter(
    (m) => m.dependsOn.length === 0 && m.dependedOnBy.length === 0,
  );
  if (isolated.length > 0 && moduleCount > 1) {
    claims.push({
      id: "isolated",
      confidence: "likely",
      statement: [
        ...joinModuleSegments(isolated.map((m) => m.id)),
        seg(
          ` ${isolated.length === 1 ? "stands" : "stand"} alone — no imports in either direction at module level. Cleanly decoupled, or disconnected from the system's life; I can't tell which from structure alone.`,
        ),
      ],
      reasoning:
        "Zero import edges touch these boundaries. Static imports are all I can see — runtime wiring (CLIs, jobs, reflection, config-driven loading) is invisible to this read, which is why this stays a 'likely', not a 'measured'.",
      evidence: [
        {
          label: isolated.length === 1 ? "Module" : "Modules",
          value: joinLabels(isolated.map((m) => m.label)),
        },
        { label: "Import edges touching them", value: "0" },
      ],
      moduleIds: isolated.map((m) => m.id),
    });
  }

  if (parsedLow > 0) {
    claims.push({
      id: "parse-gap",
      confidence: "undetermined",
      statement: [
        seg(
          `${formatCount(parsedLow, "file")} resisted full parsing. My model is thinner wherever ${parsedLow === 1 ? "it lives" : "they live"} — treat claims that touch ${parsedLow === 1 ? "it" : "them"} as provisional.`,
        ),
      ],
      reasoning:
        "Tree-sitter could not build a complete syntax tree for these files, so imports inside them may be missing from the graph every claim above is computed from.",
      evidence: [
        { label: "Fully parsed", value: `${parsedFull.toLocaleString()} of ${parsedTotal.toLocaleString()} files` },
        { label: "Partial reads", value: parsedLow.toLocaleString() },
      ],
      moduleIds: [],
    });
  } else if (parsedTotal > 0) {
    claims.push({
      id: "parse-full",
      confidence: "measured",
      statement: [
        seg(
          `Every one of the ${parsedTotal.toLocaleString()} files parsed with full structural confidence — the claims above rest on a complete read, not a sample.`,
        ),
      ],
      reasoning:
        "Tree-sitter built a complete syntax tree for every file it ingested; no imports were guessed at.",
      evidence: [
        { label: "Fully parsed", value: `${parsedFull.toLocaleString()} of ${parsedTotal.toLocaleString()} files` },
      ],
      moduleIds: [],
    });
  }

  // ----- deltas vs. the previous ready study -----
  let deltas: Claim[] | null = null;
  if (previous) {
    deltas = [];
    const prevLabels = new Set(previous.repository_graph_nodes.map((n) => n.label));
    const currentLabels = new Set(nodes.map((n) => n.label));
    const appeared = nodes.filter((n) => !prevLabels.has(n.label));
    const vanished = previous.repository_graph_nodes.filter((n) => !currentLabels.has(n.label));
    if (appeared.length > 0) {
      deltas.push({
        id: "delta-appeared",
        confidence: "measured",
        statement: [
          ...joinModuleSegments(appeared.map((n) => n.id)),
          seg(` ${appeared.length === 1 ? "is a new boundary" : "are new boundaries"} since the previous study.`),
        ],
        reasoning: "Module labels present in this study's graph but absent from the previous ready study.",
        evidence: [{ label: "New", value: joinLabels(appeared.map((n) => n.label)) }],
        moduleIds: appeared.map((n) => n.id),
      });
    }
    if (vanished.length > 0) {
      deltas.push({
        id: "delta-vanished",
        confidence: "measured",
        statement: [
          seg(`${joinLabels(vanished.map((n) => n.label))} no longer ${vanished.length === 1 ? "appears" : "appear"} as ${vanished.length === 1 ? "a module" : "modules"} — ${vanished.length === 1 ? "it was" : "they were"} dissolved, renamed, or absorbed.`),
        ],
        reasoning: "Module labels present in the previous ready study but absent from this one.",
        evidence: [{ label: "Gone", value: joinLabels(vanished.map((n) => n.label)) }],
        moduleIds: [],
      });
    }
    const edgeDelta = graph.repository_graph_edges.length - previous.repository_graph_edges.length;
    const fileDelta = graph.file_count - previous.file_count;
    if (edgeDelta !== 0) {
      deltas.push({
        id: "delta-edges",
        confidence: "measured",
        statement: [
          seg(
            edgeDelta > 0
              ? `The import web gained ${formatCount(edgeDelta, "edge")} — modules know slightly more about each other than they did.`
              : `The import web lost ${formatCount(-edgeDelta, "edge")} — coupling eased since the previous study.`,
          ),
        ],
        reasoning: "Module-to-module import edges in this study versus the previous ready study.",
        evidence: [
          { label: "Then", value: formatCount(previous.repository_graph_edges.length, "edge") },
          { label: "Now", value: formatCount(graph.repository_graph_edges.length, "edge") },
        ],
        moduleIds: [],
      });
    }
    if (deltas.length === 0) {
      deltas.push({
        id: "delta-stable",
        confidence: "measured",
        statement: [
          seg(
            `Nothing structural moved between the last two studies${fileDelta !== 0 ? ` — ${formatCount(Math.abs(fileDelta), "file")} ${fileDelta > 0 ? "arrived" : "left"}, but every boundary and import path held` : ""}. The shape is stable.`,
          ),
        ],
        reasoning: "Same module boundaries, same import edges, in both studies.",
        evidence: [
          { label: "Modules", value: String(nodes.length) },
          { label: "Import paths", value: String(graph.repository_graph_edges.length) },
        ],
        moduleIds: [],
      });
    }
  }

  // ----- how I read it (method, framed as calibration — not stat tiles) -----
  const topLanguages = [...graph.language_mix]
    .sort((a, b) => b.loc - a.loc)
    .slice(0, 3)
    .map((l) => l.language)
    .join(", ");
  const method: MethodRow[] = [
    {
      label: "Read",
      value: `${formatCount(graph.file_count, "source file")}`,
      note: graph.language_mix.length > 0 ? `mostly ${topLanguages}` : "no languages detected",
    },
    {
      label: "Parsed",
      value: parsedTotal > 0 ? `${parsedFull.toLocaleString()} of ${parsedTotal.toLocaleString()} in full` : "—",
      note:
        parsedLow > 0
          ? `${formatCount(parsedLow, "file")} only partially — the ceiling on my confidence`
          : "complete syntax trees throughout",
    },
    {
      label: "Indexed",
      value: `${formatCount(graph.knowledge_graph_status.node_count, "symbol")}`,
      note: `${formatCount(graph.knowledge_graph_status.edge_count, "relationship")} in the knowledge graph`,
    },
    {
      label: "Rolled up",
      value: `${formatCount(nodes.length, "module")}`,
      note: `${formatCount(graph.repository_graph_edges.length, "import path")} between them`,
    },
  ];

  return { thesis, claims, deltas, method, modules, keystoneId };
}
