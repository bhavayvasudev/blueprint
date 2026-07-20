"use client";

import { Modal } from "@heroui/react";
import { useId, type ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** The dialog's question or subject — always visible, always the
   * accessible name. */
  title: ReactNode;
  /** One supporting sentence under the title. */
  description?: ReactNode;
  children?: ReactNode;
  /** Actions row, right-aligned. Destructive actions belong here as a
   * `danger` Button, visually separated from the primary (MASTER.md §10). */
  footer?: ReactNode;
  /** `alertdialog` for confirmations before destructive actions. */
  role?: "dialog" | "alertdialog";
}

/** The one modal primitive, HeroUI-backed: React Aria owns the focus
 * trap, focus return, Escape/backdrop dismissal, scroll lock, and
 * portal; the glass dresses it. Glass-strong over the scrim (text-dense
 * glass rule, MASTER.md §5), modal stratum z-50 (§4); centered ≥768px,
 * bottom sheet below (§11). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  role = "dialog",
}: DialogProps) {
  const descriptionId = useId();

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      className="z-50 bg-black/50 backdrop-blur-sm"
    >
      <Modal.Container className="items-end justify-center p-0 md:items-center md:p-6">
        <Modal.Dialog
          role={role}
          aria-describedby={description ? descriptionId : undefined}
          className="glass-strong edge-light w-full max-w-lg rounded-t-2xl rounded-b-none p-8 outline-none md:rounded-2xl"
        >
          <Modal.Header className="p-0">
            <Modal.Heading className="text-xl font-semibold text-ink-950 dark:text-ink-50">
              {title}
            </Modal.Heading>
          </Modal.Header>
          {description && (
            <p id={descriptionId} className="mt-2 text-sm text-ink-500 dark:text-ink-400">
              {description}
            </p>
          )}
          {children && <div className="mt-6">{children}</div>}
          {footer && (
            <Modal.Footer className="mt-8 flex items-center justify-end gap-3 p-0">
              {footer}
            </Modal.Footer>
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
