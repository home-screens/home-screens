'use client';

import type { ReactNode } from 'react';
import { useTranslate } from '@/i18n';
import { DANGER_BUTTON } from './remote-styles';
import PrimaryButton from './PrimaryButton';

interface SaveDeleteFooterProps {
  /** The save button's words; "Save" unless the form creates something ("Add chore"). */
  saveLabel?: string;
  /** False greys the save button out; the form says why in `notice`. */
  canSave: boolean;
  onSave: () => void;
  /** The save is on its way: the button reads "Saving…", and neither button can be pressed. */
  busy?: boolean;
  /** The delete is on its way: neither button can be pressed, and the save keeps its own words. */
  deleting?: boolean;
  /** A line above the buttons: what still needs filling in, or why the last save failed. */
  notice?: ReactNode;
  noticeTone?: 'warning' | 'danger';
  /** The delete button shows only when both are given. */
  deleteLabel?: string;
  onDelete?: () => void;
  saveTestId?: string;
  deleteTestId?: string;
}

/**
 * The bottom of a phone form: the full-width amber save button and, on an
 * existing item, the quiet red delete under it. FormOverlay draws the line
 * above the footer and its padding.
 */
export default function SaveDeleteFooter({
  saveLabel,
  canSave,
  onSave,
  busy = false,
  deleting = false,
  notice,
  noticeTone = 'warning',
  deleteLabel,
  onDelete,
  saveTestId,
  deleteTestId,
}: SaveDeleteFooterProps) {
  const tCore = useTranslate('core');
  return (
    <>
      {notice && (
        <p
          style={{
            fontSize: 13,
            color: noticeTone === 'danger' ? 'var(--hs-danger)' : 'var(--hs-warning-ink)',
            textAlign: 'center',
            margin: '0 0 8px',
          }}
        >
          {notice}
        </p>
      )}
      <PrimaryButton onClick={onSave} disabled={!canSave || deleting} busy={busy} data-testid={saveTestId} style={{ marginTop: 0 }}>
        {saveLabel ?? tCore('actions.save')}
      </PrimaryButton>
      {deleteLabel && onDelete && (
        <button
          type="button"
          className="press-scale"
          onClick={onDelete}
          // Not while either is on its way: the two would race.
          disabled={busy || deleting}
          aria-busy={deleting || undefined}
          data-testid={deleteTestId}
          style={DANGER_BUTTON}
        >
          {deleteLabel}
        </button>
      )}
    </>
  );
}
