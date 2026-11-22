'use client';

import type { CSSProperties } from 'react';
import { REMOTE_ACCENT } from './remote-styles';
import BottomSheet from './BottomSheet';

export interface EventChoice {
  id: string;
  label: string;
  /** The small second line: exactly which days it touches. */
  detail: string;
  /** `primary` is the safe, highlighted choice; `danger` and `dangerFill` remove. */
  tone: 'primary' | 'plain' | 'danger' | 'dangerFill';
}

const DANGER = '#f87171';

function choiceStyle(tone: EventChoice['tone']): CSSProperties {
  const base: CSSProperties = {
    width: '100%',
    minHeight: 56,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 1,
    padding: '8px 16px',
    borderRadius: 12,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: 700,
    textAlign: 'left',
    fontFamily: 'inherit',
    border: '1px solid transparent',
  };
  switch (tone) {
    case 'primary': return { ...base, background: REMOTE_ACCENT, color: '#111' };
    case 'plain': return { ...base, background: 'var(--hs-bg-hover)', color: 'var(--hs-text-primary)' };
    case 'danger': return { ...base, background: 'transparent', color: DANGER, borderColor: 'rgba(248,113,113,0.45)' };
    case 'dangerFill': return { ...base, background: DANGER, color: '#fff' };
  }
}

/**
 * A question with two or three answers that each say what they touch: "Just
 * this day" or "Every time" when saving or removing one day of a repeating
 * event. A plain `ConfirmSheet` answers yes or no; this answers which.
 */
export default function EventChoiceSheet({ title, description, choices, cancelLabel, onPick, onCancel, testId }: {
  title: string;
  description: string;
  choices: EventChoice[];
  cancelLabel: string;
  onPick: (id: string) => void;
  onCancel: () => void;
  testId?: string;
}) {
  return (
    <BottomSheet title={title} onClose={onCancel} zIndex={210} testId={testId}>
      <p style={{ fontSize: 14, color: 'var(--hs-text-faint)', lineHeight: 1.5, margin: '0 0 16px' }}>{description}</p>
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          className="press-scale"
          data-choice={choice.id}
          onClick={() => onPick(choice.id)}
          style={choiceStyle(choice.tone)}
        >
          {choice.label}
          <span style={{ fontSize: 12.5, fontWeight: 500, opacity: 0.85 }}>{choice.detail}</span>
        </button>
      ))}
      <button
        type="button"
        className="press-scale"
        onClick={onCancel}
        style={{ width: '100%', minHeight: 48, borderRadius: 12, background: 'transparent', color: 'var(--hs-text-muted)', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', border: 0 }}
      >
        {cancelLabel}
      </button>
    </BottomSheet>
  );
}
