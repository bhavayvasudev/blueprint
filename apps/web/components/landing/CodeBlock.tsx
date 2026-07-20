"use client";

import { useState } from "react";
import { IconCheck } from "@/components/workspace/icons";

export function IconCopy({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 10.5v-6a1 1 0 0 1 1-1h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export interface CodeBlockProps {
  code: string;
  label?: string;
  className?: string;
}

/** One code panel, one copy affordance — used by Docs and the API
 * reference alike so every snippet in the marketing site looks and
 * behaves the same. Copies the raw `code` string verbatim, not the
 * rendered/highlighted markup. */
export function CodeBlock({ code, label, className = "" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied by the browser — the button
      // simply stays in its unclicked state, nothing to recover.
    }
  }

  return (
    <div className={`glass edge-light overflow-hidden rounded-2xl ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-ink-950/6 px-4 py-2.5 dark:border-white/8">
        <span className="font-mono text-xs text-ink-400 dark:text-ink-500">{label ?? "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-500 outline-none transition-colors hover:bg-ink-950/5 hover:text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:text-ink-400 dark:hover:bg-white/8 dark:hover:text-ink-50"
        >
          {copied ? (
            <IconCheck className="size-3.5 text-status-ready-deep dark:text-status-ready" />
          ) : (
            <IconCopy className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-ink-700 sm:text-sm dark:text-ink-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}
