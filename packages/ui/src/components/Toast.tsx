"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/* Tones reuse the Badge vocabulary (status hues stay state, never brand —
 * MASTER.md §7), and every tone carries a glyph: color is never the sole
 * signal (§12). */
export type ToastTone = "neutral" | "ready" | "failed" | "accent";

const TONE_ICON_CLASSES: Record<ToastTone, string> = {
  neutral: "text-ink-500 dark:text-ink-400",
  ready: "text-status-ready-deep dark:text-status-ready",
  failed: "text-status-failed-deep dark:text-status-failed",
  accent: "text-accent-600 dark:text-accent-400",
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`mt-0.5 size-4 shrink-0 ${TONE_ICON_CLASSES[tone]}`}
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      {tone === "ready" ? (
        <path d="M5.5 8l1.8 1.8L10.7 6.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : tone === "failed" ? (
        <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <path d="M8 7.5V11M8 5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  );
}

export interface ToastOptions {
  /** What changed, stated plainly — "Re-analysis complete: 2 findings
   * revised" (MASTER.md §10: the system never acts silently, so a toast
   * always says what changed and why it matters). */
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** One optional follow-up — "View", "Undo". */
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss delay; 4500ms default (3–5s rule). */
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  notify: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Read the notifier anywhere under `ToastProvider`. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}

/** Notification host — mount once in the workspace shell. Toasts live on
 * the transient stratum (z-60, MASTER.md §4), announce politely without
 * stealing focus (§12), auto-dismiss in 4.5s, and rise into place with
 * the standard enter/exit pair (§8). The viewport clears the dock on
 * small screens (§11: content never hides behind fixed chrome). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...options, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), options.duration ?? 4500),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-24 z-60 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 md:right-6 md:bottom-6"
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              role="status"
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                reduceMotion
                  ? { opacity: 0, transition: { duration: 0 } }
                  : { opacity: 0, scale: 0.98, transition: { duration: 0.22, ease: "easeIn" } }
              }
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="glass-strong edge-light pointer-events-auto flex items-start gap-3 rounded-2xl p-4"
            >
              <ToneIcon tone={toast.tone ?? "neutral"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-950 dark:text-ink-50">
                  {toast.title}
                </p>
                {toast.description && (
                  <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                    {toast.description}
                  </p>
                )}
                {toast.action && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.onClick();
                      dismiss(toast.id);
                    }}
                    className="mt-2 cursor-pointer text-xs font-medium text-accent-600 outline-none transition-colors hover:text-accent-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:text-accent-400 dark:hover:text-accent-200"
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-400 outline-none transition-colors hover:text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:hover:text-ink-50"
              >
                <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
