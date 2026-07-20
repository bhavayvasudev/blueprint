"use client";

/* The transient-notification primitive (MASTER.md §4/§10/§12) — HeroUI's
 * `Toast` owns the queue, stacking, height measurement, and slide/fade
 * transitions (react-aria-components underneath); these classes dress it
 * in Blueprint's glass material. `notify()` is a plain function, not a
 * hook — it can be called from an event handler, an effect, or outside
 * React entirely, the same way HeroUI's own `toast()` works. Mount
 * `<ToastProvider />` once in the app shell to render the queue. */
import { Spinner, Toast as HeroToast, toast } from "@heroui/react";
import type { ReactNode } from "react";

export type ToastTone = "neutral" | "ready" | "failed" | "warning" | "accent";

const VARIANT: Record<ToastTone, "default" | "accent" | "success" | "warning" | "danger"> = {
  neutral: "default",
  ready: "success",
  failed: "danger",
  warning: "warning",
  accent: "accent",
};

export interface NotifyOptions {
  /** What changed, stated plainly — "Re-analysis complete: 2 findings
   * revised" (the system never acts silently, so a toast always says
   * what changed and why it matters). */
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** One optional follow-up — "View", "Undo". */
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss delay; HeroUI's own default is 4000ms. */
  duration?: number;
}

/** Queue a toast from anywhere — no hook, no provider lookup. Returns
 * the toast's key, usable with `notify.dismiss`. */
export function notify({ title, description, tone = "neutral", action, duration }: NotifyOptions): string {
  return toast(title, {
    description,
    variant: VARIANT[tone],
    timeout: duration ?? 4000,
    actionProps: action ? { children: action.label, onPress: action.onClick } : undefined,
  });
}

notify.dismiss = (key: string) => toast.close(key);
notify.clear = () => toast.clear();
notify.promise = toast.promise;

/** Notification host — mount once in the workspace shell. Toasts live on
 * the transient stratum, rise in with HeroUI's built-in slide + fade,
 * and stack with a scale/offset per position. The close button stays
 * visible rather than hover-only — a dismiss control that only appears
 * on hover is unreachable on touch. */
export function ToastProvider() {
  return (
    <HeroToast.Provider placement="bottom end" className="right-4 bottom-24 z-60 md:right-6 md:bottom-6">
      {({ toast: queued }) => {
        const { title, description, indicator, actionProps, variant, isLoading } = queued.content;
        return (
          <HeroToast
            toast={queued}
            variant={variant}
            className="glass-strong edge-light gap-3 rounded-2xl p-4 shadow-lg"
          >
            {indicator === null ? null : (
              <HeroToast.Indicator variant={variant}>
                {isLoading ? <Spinner color="current" size="sm" /> : indicator}
              </HeroToast.Indicator>
            )}
            <HeroToast.Content className="gap-1">
              {title ? (
                <HeroToast.Title className="text-sm font-medium text-ink-950 dark:text-ink-50">
                  {title}
                </HeroToast.Title>
              ) : null}
              {description ? (
                <HeroToast.Description className="text-xs text-ink-500 dark:text-ink-400">
                  {description}
                </HeroToast.Description>
              ) : null}
            </HeroToast.Content>
            {actionProps?.children ? (
              <HeroToast.ActionButton
                {...actionProps}
                className="text-xs font-medium text-accent-600 outline-none transition-colors hover:text-accent-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:text-accent-400 dark:hover:text-accent-200"
              />
            ) : null}
            <HeroToast.CloseButton className="pointer-events-auto text-ink-400 opacity-100 outline-none transition-colors hover:text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:hover:text-ink-50" />
          </HeroToast>
        );
      }}
    </HeroToast.Provider>
  );
}
