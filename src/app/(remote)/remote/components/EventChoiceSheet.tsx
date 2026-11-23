'use client';

import type { CSSProperties } from 'react';
import { DANGER_BUTTON } from './remote-styles';
import BottomSheet from './BottomSheet';
import { confirmAnswerColors } from './ConfirmSheet';

export interface EventChoice {
  id: string;
  label: string;
  /** The small second line: exactly which days it touches. */
  detail: string;
  /** `primary` is the safe, highlighted choice; `danger` and `dangerFill` remove. */
  tone: 'primary' | 'plain' | 'danger' | 'dangerFill';
}

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
    case 'primary': return { ...base, ...confirmAnswerColors('primary') };
    case 'plain': return { ...base, background: 'var(--hs-bg-hover)', color: 'var(--hs-text-primary)' };
    // The quiet red of every phone delete (`DANGER_BUTTON`), and the full red of a confirm sheet's answer.
    case 'danger': return { ...base, background: DANGER_BUTTON.background, color: 'var(--hs-danger)' };
    case 'dangerFill': return { ...base, ...confirmAnswerColors('danger') };
  }
}

/**
 * A question with two or three answers that each say what they touch: "Just
 * this day" or "Every time" when saving or removing one day of a repeating
 * event. A plain `ConfirmSheet` answers yes or no; this answers which. On
 * the `confirm` layer with it, over the form that asked.
 */
export default function EventChoiceSheet({ title, description, choices, cancelLabel, busy = false, onPick, onCancel, testId }: {
  title: string;
  description: string;
  choices: EventChoice[];
  cancelLabel: string;
  /** The answer already given is on its way to the hub: nothing can be pressed until it is back. */
  busy?: boolean;
  onPick: (id: string) => void;
  onCancel: () => void;
  testId?: string;
}) {
  const cancel = () => {
    if (!busy) onCancel();
  };
  return (
    <BottomSheet title={title} onClose={cancel} layer="confirm" testId={testId}>
      <p style={{ fontSize: 14, color: 'var(--hs-text-faint)', lineHeight: 1.5, margin: '0 0 16px' }}>{description}</p>
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          className="press-scale"
          data-choice={choice.id}
          disabled={busy}
          onClick={() => onPick(choice.id)}
          style={{ ...choiceStyle(choice.tone), ...(busy ? { opacity: 0.6 } : {}) }}
        >
          {choice.label}
          <span style={{ fontSize: 12.5, fontWeight: 500, opacity: 0.85 }}>{choice.detail}</span>
        </button>
      ))}
      <button
        type="button"
        className="press-scale"
        disabled={busy}
        onClick={cancel}
        style={{ width: '100%', minHeight: 48, borderRadius: 12, background: 'transparent', color: 'var(--hs-text-muted)', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', border: 0, ...(busy ? { opacity: 0.6 } : {}) }}
      >
        {cancelLabel}
      </button>
    </BottomSheet>
  );
}
