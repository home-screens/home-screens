'use client';

import type { ReactNode } from 'react';
import { withAlpha } from '@/lib/hex-color';
import { REMOTE_ACCENT } from './chore-form-styles';

interface SaveDeleteFooterProps {
  saveLabel: string;
  /** False greys the save button out; the form says why in `notice`. */
  canSave: boolean;
  onSave: () => void;
  /** A line above the buttons: what still needs filling in, or why the last save failed. */
  notice?: ReactNode;
  noticeTone?: 'warning' | 'danger';
  /** The delete button shows only when both are given. */
  deleteLabel?: string;
  onDelete?: () => void;
}

/**
 * The bottom of a phone form: the full-width amber save button and, on an
 * existing item, the quiet red delete under it. FormOverlay draws the line
 * above the footer.
 */
export default function SaveDeleteFooter({
  saveLabel,
  canSave,
  onSave,
  notice,
  noticeTone = 'warning',
  deleteLabel,
  onDelete,
}: SaveDeleteFooterProps) {
  return (
    <div style={{ padding: '12px 16px' }}>
      {notice && (
        <p
          style={{
            fontSize: 13,
            color: noticeTone === 'danger' ? 'var(--hs-danger)' : 'var(--hs-warning)',
            textAlign: 'center',
            margin: '0 0 8px',
          }}
        >
          {notice}
        </p>
      )}
      <button
        type="button"
        className="press-btn"
        onClick={onSave}
        disabled={!canSave}
        style={{
          width: '100%',
          padding: '14px 24px',
          minHeight: 50,
          fontSize: 15,
          fontWeight: 700,
          borderRadius: 12,
          border: 'none',
          cursor: canSave ? 'pointer' : 'default',
          background: canSave ? REMOTE_ACCENT : 'var(--hs-text-faint)',
          color: canSave ? '#000' : 'var(--hs-text-muted)',
          opacity: canSave ? 1 : 0.5,
          transition: 'all 0.15s',
        }}
      >
        {saveLabel}
      </button>
      {deleteLabel && onDelete && (
        <button
          type="button"
          className="press-scale"
          onClick={onDelete}
          style={{
            width: '100%',
            padding: 12,
            minHeight: 44,
            marginTop: 8,
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 10,
            border: 'none',
            background: withAlpha('var(--hs-danger)', 0.12),
            color: 'var(--hs-danger)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {deleteLabel}
        </button>
      )}
    </div>
  );
}
