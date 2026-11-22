'use client';

import { Pencil } from 'lucide-react';
import { useTranslate } from '@/i18n';
import type { CalendarOverride } from '@/types/config';
import { CALENDAR_NAME_MAX, type CalendarLook } from '@/lib/calendar-overrides';
import Button from '@/components/ui/Button';
import CalendarColorChoice from './CalendarColorChoice';

/**
 * The pencil and the strip under a Google or iCloud calendar's row in
 * Settings > Calendar, where the household gives it its own name and colour.
 * The rule for what an edit stores lives in `withCalendarOverride`; these
 * only draw it.
 */

export function CalendarLookButton({ name, open, onToggle }: {
  /** The calendar's name as shown, for the button's label. */
  name: string;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslate('editor');
  const label = t('settings.calendarPage.appearance.edit', { name });
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label}
      title={label}
      data-testid="calendar-look-edit"
      className="shrink-0 rounded p-1 text-hs-text-faint transition-colors hover:bg-hs-hover hover:text-hs-text-body"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );
}

export function CalendarLookStrip({ own, override, onChange, onDone }: {
  /** The provider's own name and colour: the placeholder, and what Reset goes back to. */
  own: CalendarLook;
  override: CalendarOverride | undefined;
  onChange: (patch: CalendarOverride) => void;
  onDone: () => void;
}) {
  const t = useTranslate('editor');
  const hasOverride = Boolean(override?.name?.trim() || override?.color?.trim());
  return (
    // Under the row rather than over it: the lists scroll, and a popover
    // would be clipped by its own container. The saved flash lands here,
    // where the typing happened; while no strip is open, the calendar list
    // carries the anchor instead, so settings search still finds it.
    <div
      className="space-y-2 bg-hs-accent-soft px-3 py-2.5 pl-9"
      data-testid="calendar-look-strip"
      data-field-id="calendar.calendarOverrides"
    >
      <input
        type="text"
        value={override?.name ?? ''}
        // The provider's own name, so an empty box reads as "use the name it
        // comes with" and not as missing.
        placeholder={own.name}
        onChange={(e) => onChange({ name: e.target.value })}
        // Enter or Escape is done: every keystroke has already been kept.
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') onDone(); }}
        // The pencil was pressed to type a name, so the box takes the typing.
        autoFocus
        maxLength={CALENDAR_NAME_MAX}
        aria-label={t('settings.calendarPage.appearance.nameFor', { name: own.name })}
        data-testid="calendar-look-name"
        className="w-full rounded border border-hs-border-strong bg-hs-input px-2 py-1 text-[13px] text-hs-text-body"
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CalendarColorChoice
          // The calendar's own colour stays picked until the household picks another.
          value={override?.color?.trim() ? override.color : null}
          own={own.color}
          label={t('settings.calendarPage.appearance.colorFor', { name: own.name })}
          onChange={(color) => onChange({ color: color ?? '' })}
          customTestId="calendar-look-color"
        />
        <div className="ml-auto flex items-center gap-1.5">
          {hasOverride && (
            <Button variant="ghost" size="sm" onClick={() => onChange({ name: '', color: '' })} data-testid="calendar-look-reset">
              {t('settings.calendarPage.appearance.reset')}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onDone}>
            {t('settings.calendarPage.appearance.done')}
          </Button>
        </div>
      </div>
    </div>
  );
}
