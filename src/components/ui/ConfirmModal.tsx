'use client';

import { useEffect, useCallback } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useConfirmStore } from '@/stores/confirm-store';
import { useTranslate } from '@/i18n';
import Button from './Button';

export default function ConfirmModal() {
  const open = useConfirmStore((state) => state.open);
  // Mounted only while open, so its focus trap attaches to a real dialog and
  // takes the keyboard off whatever sat behind it.
  return open ? <ConfirmDialog /> : null;
}

function ConfirmDialog() {
  const { options, isAlert, choices, respond, respondChoice } = useConfirmStore();
  const tCore = useTranslate('core');

  const dismiss = useCallback(() => {
    if (choices) respondChoice(null);
    else respond(false);
  }, [choices, respond, respondChoice]);

  const trapRef = useFocusTrap<HTMLDivElement>();

  // While the dialog is up the keyboard is the dialog's, whatever has focus:
  // - Escape dismisses it.
  // - Tab and Shift+Tab cycle its own buttons only.
  // - A key aimed at anything outside (focus lost by a click, or a button
  //   behind) is cancelled and focus comes back to the dialog: Enter must
  //   never press a button behind it, Cmd+Z never undo a form behind it.
  // - Inside, Enter and Space press the focused button (Cancel first), never
  //   a default; nothing travels on to what is behind.
  // Caught on the way down, before any other handler on the page.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const panel = trapRef.current;
      const buttons = panel ? [...panel.querySelectorAll<HTMLElement>('button:not([disabled])')] : [];
      const inside = !!panel && e.target instanceof Node && panel.contains(e.target);
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (buttons.length === 0) return;
        const at = buttons.indexOf(document.activeElement as HTMLElement);
        const next = at < 0 ? 0 : (at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next].focus();
        return;
      }
      if (!inside || !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (!inside) buttons[0]?.focus();
      }
    },
    [dismiss, trapRef],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  // After the trap hands focus back: when that had nowhere to go (the menu
  // item that opened the dialog is gone), the caller's fallback takes it.
  const returnFocus = options.returnFocus;
  useEffect(() => () => {
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected
      && (!document.activeElement || document.activeElement === document.body)) returnFocus.focus();
  }, [returnFocus]);

  const variant = options.variant ?? 'danger';

  return (
    <div
      className="fixed inset-0 z-confirm flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={options.title ?? tCore('actions.confirm')}
      // A click on the dimmed backdrop dismisses, as in every other window.
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      {/* Focusable itself, so a click on its text keeps focus in the dialog. */}
      <div ref={trapRef} tabIndex={-1} className="bg-hs-panel border border-hs-border-strong rounded-xl w-full max-w-sm shadow-2xl outline-none">
        {options.title && (
          <div className="px-5 pt-4 pb-0">
            <h3 className="text-sm font-semibold text-hs-text-primary">{options.title}</h3>
          </div>
        )}
        <div className="px-5 py-4">
          <p className="text-sm text-hs-text-secondary leading-relaxed">{options.message}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 pb-4">
          {choices ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => respondChoice(null)}>
                {tCore('actions.cancel')}
              </Button>
              {choices.map((choice) => (
                <Button
                  key={choice.value}
                  variant={choice.variant ?? 'secondary'}
                  size="sm"
                  onClick={() => respondChoice(choice.value)}
                >
                  {choice.label}
                </Button>
              ))}
            </>
          ) : (
            <>
              {!isAlert && (
                <Button variant="secondary" size="sm" onClick={() => respond(false)}>
                  {options.cancelLabel ?? tCore('actions.cancel')}
                </Button>
              )}
              <Button variant={variant} size="sm" onClick={() => respond(true)}>
                {options.confirmLabel ?? tCore('actions.confirm')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
