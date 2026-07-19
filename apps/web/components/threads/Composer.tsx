"use client";

import { useEffect, useRef, useState } from "react";
import { IconArrowUp } from "@/components/workspace/icons";

/** The question box. Grows with its content, submits on Enter (Shift+Enter
 * for a newline), and disables while an answer is streaming so a thread
 * stays one investigation at a time. */
export function Composer({
  onSubmit,
  disabled,
  placeholder = "Ask this repository…",
  autoFocus,
}: {
  onSubmit: (question: string) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  };

  return (
    <div className="glass-strong edge-light flex items-end gap-2 rounded-2xl p-2 pl-4">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="max-h-44 flex-1 resize-none bg-transparent py-2 text-[0.95rem] leading-relaxed text-ink-900 placeholder:text-ink-400 focus:outline-none disabled:opacity-60 dark:text-ink-50"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !value.trim()}
        aria-label="Ask"
        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink-950 text-white transition hover:bg-ink-800 disabled:opacity-40 dark:bg-white dark:text-ink-950 dark:hover:bg-ink-100"
      >
        <IconArrowUp className="size-4.5" />
      </button>
    </div>
  );
}
