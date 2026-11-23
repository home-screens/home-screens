'use client';

import { useState } from 'react';
import LabeledField from '@/components/ui/LabeledField';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import FieldHint from '@/components/ui/FieldHint';

/** Three patterns that cover the shapes people ask for, shown with today's
 *  date next to them so "EEEE" stops being a guess. */
const CUSTOM_DATE_EXAMPLES = ['EEEE, MMMM d', 'EEE d MMM', 'd/M/yyyy'];

const CUSTOM = '__custom__';

interface DateFormatFieldProps {
  label: string;
  /** The saved pattern. */
  value: string;
  presets: { value: string; label: string }[];
  onChange: (pattern: string) => void;
  /**
   * Today's date written with a pattern, the way the wall will write it (in
   * the household's language and the module's time zone). May throw on a
   * pattern that means nothing.
   */
  format: (pattern: string) => string;
  words: { custom: string; placeholder: string; invalid: string; examplesHeading: string };
  testIdPrefix: string;
}

/**
 * A date format picker: the presets, a box for a pattern typed by hand, a
 * live preview, and worked examples for the hand-typed kind. The Clock and
 * the Date module each bring their own presets and their own way of writing
 * a pattern in the household's language.
 */
export default function DateFormatField({
  label,
  value,
  presets,
  onChange,
  format,
  words,
  testIdPrefix,
}: DateFormatFieldProps) {
  const [showCustom, setShowCustom] = useState(() => !presets.some((p) => p.value === value));
  const preview = (pattern: string) => {
    try {
      return format(pattern);
    } catch {
      return words.invalid;
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <LabeledField label={label}>
        <select
          value={showCustom ? CUSTOM : value}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setShowCustom(true);
            } else {
              setShowCustom(false);
              onChange(e.target.value);
            }
          }}
          className={INPUT_CLASS}
        >
          {presets.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
          <option value={CUSTOM}>{words.custom}</option>
        </select>
      </LabeledField>
      {showCustom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={words.placeholder}
          className={INPUT_CLASS}
        />
      )}
      <span className="text-xs text-hs-text-faint">{preview(value)}</span>
      {/* A pattern language with no legend is a dead end. Three worked
          examples, rendered against today's date, are enough to get from
          "what do I type" to a format that works. */}
      {showCustom && (
        <div className="mt-1 border-t border-hs-border pt-2" data-testid={`${testIdPrefix}-format-examples`}>
          <FieldHint className="mb-1">{words.examplesHeading}</FieldHint>
          {CUSTOM_DATE_EXAMPLES.map((pattern) => (
            <button
              key={pattern}
              type="button"
              onClick={() => onChange(pattern)}
              className="flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 text-left hover:bg-hs-hover transition-colors"
            >
              <code className="font-mono text-[11px] text-hs-text-secondary">{pattern}</code>
              <span className="text-[11px] text-hs-text-faint">{preview(pattern)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
