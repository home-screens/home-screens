'use client';

import { useState } from 'react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { repeatFrequenciesFor, type RepeatFrequency, type RepeatRule } from '@/lib/calendar-write';
import { repeatChoiceWords } from '@/lib/calendar-repeat-words';
import { FIELD, SHEET_LABEL, selectedPillStyle } from './remote-styles';
import BottomSheet from './BottomSheet';

/**
 * The Repeats choices for an event starting on `date`: seven
 * plain choices worded from that day, and when it stops. Every weekday is
 * offered only from a weekday.
 */
export default function EventRepeatSheet({ date, value, onDone, onClose }: {
  date: string;
  value: RepeatRule | null;
  onDone: (rule: RepeatRule | null) => void;
  onClose: () => void;
}) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const [frequency, setFrequency] = useState<RepeatFrequency | null>(value?.frequency ?? null);
  const [until, setUntil] = useState<string | null>(value?.until ?? null);
  const choices: (RepeatFrequency | null)[] = [null, ...repeatFrequenciesFor(date)];

  return (
    <BottomSheet title={t('calendarTab.form.repeats')} onClose={onClose} zIndex={210} testId="event-repeat-sheet">
      <div role="radiogroup" aria-label={t('calendarTab.form.repeats')}>
        {choices.map((choice) => {
          const on = choice === frequency;
          return (
            <button
              key={choice ?? 'none'}
              type="button"
              role="radio"
              aria-checked={on}
              data-frequency={choice ?? 'none'}
              onClick={() => setFrequency(choice)}
              style={{
                width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px',
                background: 'transparent', border: 0, borderTop: choice === null ? 0 : '1px solid var(--hs-border)',
                color: on ? 'var(--hs-text-primary)' : 'var(--hs-text-body)', fontSize: 15, fontWeight: on ? 600 : 400,
                textAlign: 'left', fontFamily: 'inherit',
              }}
            >
              <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', flex: 'none', border: on ? '6px solid var(--hs-accent)' : '2px solid #525252' }} />
              <span style={{ flex: 1 }}>{choice ? repeatChoiceWords(choice, date, locale, tCore) : tCore('calendarRepeat.none')}</span>
              {choice === 'weekdays' && <small style={{ color: 'var(--hs-text-faint)', fontSize: 12 }}>{tCore('calendarRepeat.weekdaysHint')}</small>}
            </button>
          );
        })}
      </div>
      {frequency && (
        <>
          <span style={SHEET_LABEL}>{t('calendarTab.form.stops')}</span>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {[false, true].map((onDate) => (
              <button
                key={String(onDate)}
                type="button"
                className="press-scale"
                aria-pressed={(until !== null) === onDate}
                onClick={() => setUntil(onDate ? (until ?? date) : null)}
                style={{ flex: 1, minHeight: 44, borderRadius: 12, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', ...selectedPillStyle((until !== null) === onDate, 'var(--hs-text-muted)') }}
              >
                {onDate ? t('calendarTab.form.stopsOnDate') : t('calendarTab.form.stopsNever')}
              </button>
            ))}
          </div>
          {until !== null && (
            <input
              type="date"
              aria-label={t('calendarTab.form.stopsOnDate')}
              min={date}
              value={until}
              onChange={(e) => setUntil(e.target.value || date)}
              style={{ ...FIELD, marginBottom: 14 }}
            />
          )}
        </>
      )}
      <button
        type="button"
        className="press-scale"
        data-testid="event-repeat-done"
        onClick={() => onDone(frequency ? { frequency, ...(until ? { until } : {}) } : null)}
        style={{ width: '100%', minHeight: 48, borderRadius: 12, background: 'var(--hs-accent)', color: '#fff', fontSize: 15, fontWeight: 700, border: 0, fontFamily: 'inherit', marginTop: 6 }}
      >
        {t('calendarTab.form.done')}
      </button>
    </BottomSheet>
  );
}
