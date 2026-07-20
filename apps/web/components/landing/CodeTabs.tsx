"use client";

import { useState } from "react";
import { IconCheck } from "@/components/workspace/icons";
import { IconCopy } from "./CodeBlock";

export interface CodeTab {
  label: string;
  code: string;
}

/** Language-switched code sample — the API reference's request examples
 * (curl / JS / Python) share one copy affordance keyed to whichever tab
 * is active. */
export function CodeTabs({ tabs, className = "" }: { tabs: CodeTab[]; className?: string }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const activeTab = tabs[active];

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(activeTab.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied by the browser — nothing to recover.
    }
  }

  return (
    <div className={`glass edge-light overflow-hidden rounded-2xl ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-ink-950/6 px-2 dark:border-white/8">
        <div className="flex items-center gap-1 py-2" role="tablist">
          {tabs.map((tab, index) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={index === active}
              onClick={() => setActive(index)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ${
                index === active
                  ? "bg-ink-950/8 text-ink-950 dark:bg-white/10 dark:text-ink-50"
                  : "text-ink-400 hover:text-ink-800 dark:text-ink-500 dark:hover:text-ink-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-500 outline-none transition-colors hover:bg-ink-950/5 hover:text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:text-ink-400 dark:hover:bg-white/8 dark:hover:text-ink-50"
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
        <code>{activeTab.code}</code>
      </pre>
    </div>
  );
}
