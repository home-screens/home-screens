'use client';

import { useState } from 'react';
import type { Screen } from '@/types/config';
import type { TranslateFn } from '@/i18n';
import { DEFAULT_GO_BACK_AFTER_MS, goBackAfterFromMinutes, goBackAfterMinutesText, resolveGoBackAfterMs } from '@/lib/on-demand-screen';

type Note =
  | { kind: 'willBe' | 'changed'; from: string; to: string; clamped: boolean }
  | { kind: 'kept'; to: string };

/**
 * The quiet time of a screen that shows only when opened, in minutes: whole
 * or half, 0 to a day. Shown on the screen's own settings and, in place, on
 * every module whose open button opens the screen, so one number is edited
 * from wherever the household is looking.
 *
 * A clean value saves as it is typed. One that has to be put right (2.3, a
 * number past a day) says what it will become while typing and is saved,
 * adjusted, on leaving the field. A blank, a minus or letters never save:
 * on leaving, the field goes back to the saved value and says so. Only a
 * typed 0 means "stay until someone taps Back".
 */
export function GoBackAfterField({ id, screen, t, onChange }: {
  id: string;
  screen: Pick<Screen, 'goBackAfterMs'>;
  t: TranslateFn;
  onChange: (ms: number) => void;
}) {
  // What the input shows while it has focus; null shows the saved value.
  const [draft, setDraft] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const saved = goBackAfterMinutesText(resolveGoBackAfterMs(screen));

  const read = (text: string) => {
    const typed = text.trim();
    if (typed === '' || typed.startsWith('-')) return null;
    return goBackAfterFromMinutes(typed);
  };

  const onType = (text: string) => {
    setDraft(text);
    const parsed = read(text);
    if (!parsed) { setNote(null); return; }
    if (parsed.changed) {
      setNote({ kind: 'willBe', from: text.trim(), to: goBackAfterMinutesText(parsed.ms), clamped: parsed.changed === 'clamped' });
      return;
    }
    setNote(null);
    onChange(parsed.ms);
  };

  const onLeave = () => {
    if (draft !== null) {
      const parsed = read(draft);
      if (!parsed) {
        // Nothing usable was typed: keep what was saved, and say so.
        if (draft.trim() !== saved) setNote({ kind: 'kept', to: saved });
      } else if (parsed.changed) {
        onChange(parsed.ms);
        setNote({ kind: 'changed', from: draft.trim(), to: goBackAfterMinutesText(parsed.ms), clamped: parsed.changed === 'clamped' });
      }
    }
    setDraft(null);
  };

  const noteText = !note ? ''
    : note.kind === 'kept' ? t('screenSettings.goBackAfterKept', { to: note.to })
      : t(`screenSettings.goBackAfter${note.kind === 'willBe' ? 'WillBe' : 'Changed'}${note.clamped ? 'Clamped' : 'Rounded'}`, { from: note.from, to: note.to });

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          id={id}
          data-field-id="goBackAfterMs"
          // Text with the decimal keypad, not type="number": a number field
          // drops a decimal comma before the change handler sees it, so
          // "1,5" arrived as 15, and it draws spinner arrows in Firefox.
          type="text"
          inputMode="decimal"
          value={draft ?? saved}
          onChange={(e) => onType(e.target.value)}
          onBlur={onLeave}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className={`pl-2 pr-1 py-1 text-xs bg-hs-input border rounded text-hs-text-body w-20 ${note ? 'border-hs-warning' : 'border-hs-border-strong'}`}
        />
        <span className="text-xs text-hs-text-muted">{t('screenSettings.goBackAfterUnit')}</span>
      </div>
      {note && (
        <p className="text-[11px] text-hs-warning mt-1.5" data-testid="go-back-after-note">
          {noteText}
        </p>
      )}
      <p className="text-[11px] text-hs-text-faint mt-1.5">
        {t('screenSettings.goBackAfterHelp', { minutes: DEFAULT_GO_BACK_AFTER_MS / 60_000 })}
      </p>
    </div>
  );
}
