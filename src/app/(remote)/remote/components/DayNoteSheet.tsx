'use client';

import { useId, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { fullDateHeading, useFormattingLocale, useTranslate } from '@/i18n';
import { clampDayNoteText, dayNoteLength, normalizeDayNoteText } from '@/lib/day-notes';
import { DAY_NOTES_LIMITS, type DayNote } from '@/types/day-notes';
import BottomSheet from './BottomSheet';
import { DANGER_BUTTON, HELPER_TEXT, PRIMARY_BUTTON, SHEET_FIELD, SHEET_LABEL } from './lists-styles';

/** `YYYY-MM-DD` as a Date at noon, so formatting it never slips a day. */
export function dateOfIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/** The day in words for a heading: "Wednesday, November 4", "Mittwoch, 4. November". */
export function dayInWords(iso: string, locale: string): string {
  return fullDateHeading(dateOfIso(iso), locale);
}

const AMBER = '#f59e0b';
/** The counter turns amber this close to the cap, so the cap is never a surprise. */
const NEAR_LIMIT = 10;

/**
 * Write a new note for a day, or change or remove one. The title is the day
 * in words, so nobody has to count dates. The box wraps, so the whole note is
 * always in view, and the cursor is in it as the sheet opens, since the tap
 * that opened it already meant "write". Enter saves; saving the words empty
 * removes the note, the same rule the hub applies.
 */
export default function DayNoteSheet({ date, note, initialText, onSave, onRemove, onClose }: {
  date: string;
  /** The note being changed, or null for a new one. */
  note: DayNote | null;
  /** What the box starts with: the note's words, or words left unsaved last time. */
  initialText: string;
  onSave: (text: string) => void;
  onRemove: () => void;
  /** Closed without saving: hands back what was in the box, so it can be offered again. */
  onClose: (draft: string) => void;
}) {
  const t = useTranslate('remote');
  const locale = useFormattingLocale();
  const inputId = useId();
  const limitId = useId();
  const [text, setText] = useState(initialText);
  const clean = normalizeDayNoteText(text);
  const used = dayNoteLength(clean);
  const max = DAY_NOTES_LIMITS.maxTextLength;
  const canSubmit = note === null ? clean.length > 0 : clean !== note.text;

  const submit = () => {
    if (!canSubmit) return;
    if (clean) onSave(clean);
    else onRemove();
  };

  return (
    <BottomSheet
      title={dayInWords(date, locale)}
      titleAside={(
        <span style={{ color: used >= max - NEAR_LIMIT ? AMBER : undefined }}>
          {t('notes.counter', { used, max })}
        </span>
      )}
      onClose={() => onClose(text)}
      testId="day-note-sheet"
      initialFocus="field"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p style={{ ...HELPER_TEXT, marginTop: -4, fontSize: 13 }}>{t('notes.dayNotes.sheetHint')}</p>
        <label htmlFor={inputId} style={SHEET_LABEL}>
          {t('notes.noteLabel')}
        </label>
        <textarea
          id={inputId}
          value={text}
          rows={2}
          // One line of words: runs of spaces and line breaks become one
          // space as they are typed, and the cap counts an emoji as one.
          onChange={(e) => setText(clampDayNoteText(e.target.value.replace(/\s+/g, ' ')))}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            submit();
          }}
          placeholder={t('notes.dayNotes.placeholder')}
          enterKeyHint="done"
          aria-describedby={used >= max ? limitId : undefined}
          data-testid="day-note-sheet-text"
          style={{ ...SHEET_FIELD, display: 'block', minHeight: 72, lineHeight: 1.35, resize: 'none', hyphens: 'auto' }}
        />
        {used >= max && (
          <p id={limitId} role="status" style={{ ...HELPER_TEXT, color: AMBER, fontSize: 13 }}>
            {t('notes.dayNotes.atLimit')}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          {note !== null && (
            <button
              type="button"
              className="press-scale"
              data-testid="day-note-sheet-remove"
              onClick={onRemove}
              style={{ ...DANGER_BUTTON, marginTop: 0, width: 'auto', padding: '0 18px', gap: 8, fontSize: 14, fontWeight: 600 }}
            >
              <Trash2 size={18} aria-hidden="true" />
              {t('notes.dayNotes.remove')}
            </button>
          )}
          <button
            type="submit"
            className="press-btn"
            data-testid="day-note-sheet-submit"
            disabled={!canSubmit}
            style={{ ...PRIMARY_BUTTON, marginTop: 0, flex: 1, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'default' }}
          >
            {note === null ? t('notes.dayNotes.put') : t('notes.save')}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
