'use client';

import { Pencil } from 'lucide-react';
import { useTranslate } from '@/i18n';
import type { CalendarOverride } from '@/types/config';
import { CALENDAR_NAME_MAX, type CalendarLook } from '@/lib/calendar-overrides';
import { withCssColorAlpha } from '@/lib/hex-color';

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
  return (
    // Under the row rather than over it: the lists scroll, and a popover
    // would be clipped by its own container. The saved flash lands here,
    // where the typing happened; while no strip is open, the calendar list
    // carries the anchor instead, so settings search still finds it.
    <div
      className="flex items-center gap-2 bg-hs-accent-soft px-3 py-2 pl-9"
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
        // The pencil was pressed to type a name, so the box takes the typing.
        autoFocus
        maxLength={CALENDAR_NAME_MAX}
        aria-label={t('settings.calendarPage.appearance.nameFor', { name: own.name })}
        data-testid="calendar-look-name"
        className="min-w-0 flex-1 rounded border border-hs-border-strong bg-hs-input px-2 py-1 text-[13px] text-hs-text-body"
      />
      <input
        type="color"
        // The colour box only takes #rrggbb; Apple can send #rgb.
        value={withCssColorAlpha(override?.color || own.color, 1) ?? '#888888'}
        onChange={(e) => onChange({ color: e.target.value })}
        aria-label={t('settings.calendarPage.appearance.colorFor', { name: own.name })}
        data-testid="calendar-look-color"
        className="h-7 w-9 shrink-0 cursor-pointer rounded border border-hs-border-strong bg-transparent"
      />
      {(override?.name || override?.color) && (
        <button
          type="button"
          onClick={() => onChange({ name: '', color: '' })}
          data-testid="calendar-look-reset"
          className="shrink-0 text-xs text-hs-text-muted hover:text-hs-text-body"
        >
          {t('settings.calendarPage.appearance.reset')}
        </button>
      )}
      <button
        type="button"
        onClick={onDone}
        className="shrink-0 text-xs text-hs-text-muted hover:text-hs-text-body"
      >
        {t('settings.calendarPage.appearance.done')}
      </button>
    </div>
  );
}
