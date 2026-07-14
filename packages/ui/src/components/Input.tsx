"use client";

import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

const FIELD_CLASSES =
  "w-full rounded-md border border-ink-200 bg-white/70 px-3 py-2.5 text-sm text-ink-950 placeholder:text-ink-400 outline-none transition-colors focus-visible:border-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900/70 dark:text-ink-50 dark:placeholder:text-ink-500";

interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  hintId: string;
  errorId: string;
  children: ReactNode;
}

/* Label above, error below the field it belongs to, persistent helper
 * text — never placeholder-only labels (MASTER.md §12). */
function FieldShell({ id, label, hint, error, required, hintId, errorId, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-ink-700 dark:text-ink-200">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-status-failed">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p role="alert" id={errorId} className="text-xs text-status-failed">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-xs text-ink-500 dark:text-ink-400">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visible label — required, never a placeholder standing in for one. */
  label: ReactNode;
  /** Persistent helper text below the field. */
  hint?: ReactNode;
  /** Error message; when set it replaces the hint, announces via
   * `role="alert"`, and should state cause + how to fix. */
  error?: ReactNode;
  /** Module paths, tokens, anything code-shaped renders mono. */
  mono?: boolean;
}

/** The one text-input primitive (MASTER.md §10/§12): visible label,
 * helper text, error adjacent to the field, accent focus ring. */
export function Input({
  label,
  hint,
  error,
  mono = false,
  id,
  required,
  className = "",
  ...rest
}: InputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      hintId={hintId}
      errorId={errorId}
    >
      <input
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`${FIELD_CLASSES} ${mono ? "font-mono" : ""} ${className}`}
        {...rest}
      />
    </FieldShell>
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
  id,
  required,
  rows = 3,
  className = "",
  ...rest
}: TextAreaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      hintId={hintId}
      errorId={errorId}
    >
      <textarea
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`${FIELD_CLASSES} resize-y ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}
