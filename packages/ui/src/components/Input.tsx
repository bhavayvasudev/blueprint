"use client";

import {
  Description,
  FieldError,
  Input as HeroInput,
  Label,
  TextArea as HeroTextArea,
  TextField,
} from "@heroui/react";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

const FIELD_CLASSES =
  "w-full rounded-md border border-ink-200 bg-white/70 px-3 py-2.5 text-sm text-ink-950 placeholder:text-ink-400 outline-none transition-[border-color,box-shadow] duration-200 focus-visible:border-accent-500 focus-visible:shadow-[0_0_0_4px_rgb(46_107_255/0.14)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900/70 dark:text-ink-50 dark:placeholder:text-ink-500 dark:focus-visible:shadow-[0_0_0_4px_rgb(46_107_255/0.22)]";

const LABEL_CLASSES = "text-xs font-medium text-ink-700 dark:text-ink-200";
const HINT_CLASSES = "text-xs text-ink-500 dark:text-ink-400";
const ERROR_CLASSES = "text-xs text-status-failed-deep dark:text-status-failed";

/* Label above, error below the field it belongs to, persistent helper
 * text — never placeholder-only labels (MASTER.md §12). The id/aria
 * wiring (label↔field, describedby for hint and error) now comes from
 * HeroUI's TextField context instead of hand-managed ids. */
interface FieldShellProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
}

function FieldShell({ label, hint, error, required, children }: FieldShellProps) {
  return (
    <>
      <Label className={LABEL_CLASSES}>
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-status-failed">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <FieldError className={ERROR_CLASSES}>{error}</FieldError>
      ) : (
        hint && <Description className={HINT_CLASSES}>{hint}</Description>
      )}
    </>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visible label — required, never a placeholder standing in for one. */
  label: ReactNode;
  /** Persistent helper text below the field. */
  hint?: ReactNode;
  /** Error message; when set it replaces the hint, announces to
   * assistive tech, and should state cause + how to fix. */
  error?: ReactNode;
  /** Module paths, tokens, anything code-shaped renders mono. */
  mono?: boolean;
}

/** The one text-input primitive (MASTER.md §10/§12): visible label,
 * helper text, error adjacent to the field, accent focus ring. HeroUI's
 * TextField carries the association and invalid-state semantics; the
 * inner input keeps its native props so existing call sites (value,
 * onChange, onKeyDown…) work unchanged. */
export function Input({
  label,
  hint,
  error,
  mono = false,
  required,
  className = "",
  ...rest
}: InputProps) {
  return (
    <TextField
      isInvalid={error ? true : undefined}
      isRequired={required}
      className="flex flex-col gap-1.5"
    >
      <FieldShell label={label} hint={hint} error={error} required={required}>
        <HeroInput
          required={required}
          className={`${FIELD_CLASSES} ${mono ? "font-mono" : ""} ${className}`}
          {...rest}
        />
      </FieldShell>
    </TextField>
  );
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

/** Multi-line sibling of `Input` — same shell, same rules. The natural
 * home of the Threads question box. */
export function TextArea({
  label,
  hint,
  error,
  required,
  rows = 3,
  className = "",
  ...rest
}: TextAreaProps) {
  return (
    <TextField
      isInvalid={error ? true : undefined}
      isRequired={required}
      className="flex flex-col gap-1.5"
    >
      <FieldShell label={label} hint={hint} error={error} required={required}>
        <HeroTextArea
          rows={rows}
          required={required}
          className={`${FIELD_CLASSES} resize-y ${className}`}
          {...rest}
        />
      </FieldShell>
    </TextField>
  );
}
