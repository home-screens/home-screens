'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useSettledTap } from '@/hooks/useSheetTapGuard';
import { useTranslate } from '@/i18n';
import SheetFrame from './SheetFrame';
import { memberInk } from '@/lib/family-avatar';
import { REMOTE_ACCENT, REMOTE_ON_ACCENT } from './remote-styles';

/**
 * What the answer button does, and so its colour: `danger` removes or
 * replaces something (red, white words); `primary` loses nothing (start, put
 * back, fill the empty nights) and is the phone's amber with dark words.
 */
export type ConfirmTone = 'danger' | 'primary';

/** The answer's fill and ink: a person's own colour when given, else the tone's. */
export function confirmAnswerColors(tone: ConfirmTone, memberColor?: string): CSSProperties {
  if (memberColor) return { background: memberColor, color: memberInk(memberColor) };
  return tone === 'primary'
    ? { background: REMOTE_ACCENT, color: REMOTE_ON_ACCENT }
    : { background: 'var(--hs-danger)', color: 'var(--hs-on-danger)' };
}

/**
 * The phone's yes-or-no question, the answer on top (red unless it loses
 * nothing) and Cancel under it.
 *
 * When to ask: anything a person built (a chore, a reward, a list, a board
 * note, a routine, an event, a family member) and every bulk removal or
 * replace ("Remove done items", restoring a backup) asks here first. A single
 * small item (one to-do item, one day note) goes at once instead, with an
 * Undo on the toast (`showToast`'s action). Never a "tap again" button.
 */
export default function ConfirmSheet({
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  memberColor,
  icon,
  onConfirm,
  onCancel,
  settleMs = 0,
  guardTaps = false,
}: {
  title: string;
  description: string;
  /**
   * The verb on the button, always the caller's own ("Delete", "Restore",
   * "Start"): there is no generic "Confirm" to fall back on, so a question
   * can never end in a button that does not say what it does.
   */
  confirmLabel: ReactNode;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /**
   * The answer in one person's own colour (spending that kid's tickets), with
   * ink chosen to read on it. Wins over `tone`.
   */
  memberColor?: string;
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Taps in the first few milliseconds are ignored. For a sheet opened from a
   * button in the same spot with the same words, where a double tap would
   * otherwise confirm (or dismiss) it before anyone read it.
   */
  settleMs?: number;
  /** As on `BottomSheet`: over a list where a stray second tap would tick or pay for something. */
  guardTaps?: boolean;
}) {
  // Cancel defaults through `core.actions`, so callers need not translate it.
  const tCore = useTranslate('core');
  const resolvedCancelLabel = cancelLabel ?? tCore('actions.cancel');
  const settled = useSettledTap(settleMs);

  return (
    // On the `confirm` layer, over whatever asked. A real dialog role, so the
    // confirm button can be addressed as "the button inside the sheet" rather
    // than "the last button with this label". The trigger and the confirm
    // deliberately share their wording, and the label-only form silently
    // resolves to the trigger during the render that opens the sheet.
    <SheetFrame
      layer="confirm"
      label={title}
      onClose={onCancel}
      settleMs={settleMs}
      guardTaps={guardTaps}
      testId="confirm-sheet"
      bottomGap={24}
      panelStyle={{
        background: 'var(--hs-bg-panel)',
        borderRadius: '20px 20px 0 0',
        padding: '24px 16px',
        textAlign: icon ? 'center' : undefined,
      }}
    >
      {icon && (
        <div style={{ marginBottom: 12 }}>{icon}</div>
      )}
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--hs-text-primary)', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 14, color: 'var(--hs-text-faint)', lineHeight: 1.5, marginBottom: 24 }}>
        {description}
      </div>
      <button
        className="press-btn"
        onClick={settled(onConfirm)}
        style={{
          width: '100%',
          minHeight: 48,
          padding: 14,
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 700,
          ...confirmAnswerColors(tone, memberColor),
          border: 'none',
          cursor: 'pointer',
          marginBottom: 8,
        }}
      >
        {confirmLabel}
      </button>
      <button
        className="press-scale"
        onClick={onCancel}
        style={{
          width: '100%',
          minHeight: 48,
          padding: 14,
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 600,
          background: 'var(--hs-bg-hover)',
          color: 'var(--hs-text-body)',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {resolvedCancelLabel}
      </button>
    </SheetFrame>
  );
}
