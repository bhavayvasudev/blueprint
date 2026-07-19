"use client";

import { Fragment, type ReactNode } from "react";

/** Renders a grounded answer as editorial sections, never a wall of text.
 * A deliberately small, safe markdown subset — the answer format is one we
 * control (## headings, - bullets, **bold**, `code`, and [n] citations), so
 * this avoids a markdown dependency and, crucially, renders [n] as a live
 * citation handle that jumps to its evidence card (PRODUCT.md §"Every claim
 * is a handle"). No raw HTML is ever interpreted. */
export function AnswerBody({
  content,
  onCite,
}: {
  content: string;
  onCite?: (index: number) => void;
}) {
  const blocks = groupBlocks(content);
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          return (
            <h3
              key={i}
              className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-accent-600 dark:text-accent-400"
            >
              {block.text}
            </h3>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={i} className="flex flex-col gap-2">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2.5 text-[0.95rem] leading-relaxed text-ink-700 dark:text-ink-200">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-500/70" aria-hidden />
                  <span>{renderInline(item, onCite)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-[0.95rem] leading-relaxed text-ink-700 dark:text-ink-200">
            {renderInline(block.text, onCite)}
          </p>
        );
      })}
    </div>
  );
}

type Block =
  | { kind: "heading"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "paragraph"; text: string };

function groupBlocks(content: string): Block[] {
  const lines = content.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ kind: "list", items: list });
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", text: heading[1].trim() });
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1].trim());
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g;

function renderInline(text: string, onCite?: (index: number) => void): ReactNode {
  const parts = text.split(INLINE).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-ink-900 dark:text-ink-50">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded-md bg-ink-950/[0.05] px-1.5 py-0.5 font-mono text-[0.85em] text-ink-800 dark:bg-white/10 dark:text-ink-100"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const cite = part.match(/^\[(\d+)\]$/);
    if (cite) {
      const index = Number(cite[1]);
      return (
        <button
          key={i}
          type="button"
          onClick={() => onCite?.(index)}
          className="mx-0.5 inline-flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-[0.4rem] bg-accent-500/12 px-1 align-[0.05em] text-[0.7rem] font-semibold text-accent-700 tabular-nums transition hover:bg-accent-500/25 dark:text-accent-300"
          aria-label={`Jump to evidence ${index}`}
        >
          {index}
        </button>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
