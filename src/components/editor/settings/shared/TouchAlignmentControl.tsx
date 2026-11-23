'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import {
  TOUCH_MATRIX_IDENTITY,
  formatTouchMatrix,
  parseTouchMatrix,
  touchAlignmentMode,
  type TouchAlignmentMode,
} from '@/lib/touch-matrix';
import { SETTINGS_INPUT_CLASS } from '@/components/ui/input-classes';
import FieldHint from '@/components/ui/FieldHint';

interface TouchAlignmentControlProps {
  /** The saved `touchMatrix`; unset means touch follows the screen rotation. */
  value: number[] | null | undefined;
  onChange: (next: number[] | undefined) => void;
}

const INPUT_CLASS =
  `w-full ${SETTINGS_INPUT_CLASS}`;

/**
 * How taps line up with the picture on a touchscreen plugged into the hub.
 * Rendered by both canvas cards, each inside its own row and label.
 *
 * "Your own numbers" has nothing to save until six numbers are typed, so the
 * pick is held here and the numbers commit on blur; text that is not six
 * numbers snaps back to what is saved.
 */
export default function TouchAlignmentControl({ value, onChange }: TouchAlignmentControlProps) {
  const t = useTranslate('editor');
  const saved = touchAlignmentMode(value);
  const [pickedCustom, setPickedCustom] = useState(false);
  // null while nothing is being typed, so the box shows what is saved even
  // when the saved value arrives after the first render.
  const [draft, setDraft] = useState<string | null>(null);
  const mode: TouchAlignmentMode = pickedCustom ? 'custom' : saved;
  const savedText = saved === 'custom' ? formatTouchMatrix(value) : '';

  const pick = (next: TouchAlignmentMode) => {
    setPickedCustom(next === 'custom');
    setDraft(null);
    if (next !== 'custom' && next !== saved) onChange(next === 'leave' ? [...TOUCH_MATRIX_IDENTITY] : undefined);
  };

  const commitDraft = () => {
    const parsed = draft == null ? null : parseTouchMatrix(draft);
    setDraft(null);
    if (parsed && formatTouchMatrix(parsed) !== formatTouchMatrix(value)) onChange(parsed);
  };

  return (
    <>
      <select
        value={mode}
        onChange={(e) => pick(e.target.value as TouchAlignmentMode)}
        aria-label={t('settings.touchAlignment.label')}
        className={INPUT_CLASS}
      >
        <option value="follow">{t('settings.touchAlignment.optionFollow')}</option>
        <option value="leave">{t('settings.touchAlignment.optionLeave')}</option>
        <option value="custom">{t('settings.touchAlignment.optionCustom')}</option>
      </select>
      {mode === 'custom' && (
        <input
          type="text"
          inputMode="decimal"
          value={draft ?? savedText}
          placeholder="0 1 0 -1 0 1"
          aria-label={t('settings.touchAlignment.customLabel')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className={`${INPUT_CLASS} mt-2 tabular-nums`}
        />
      )}
      <FieldHint className="mt-1.5">
        {mode === 'custom' ? t('settings.touchAlignment.customHelp') : t('settings.touchAlignment.help')}
      </FieldHint>
    </>
  );
}
