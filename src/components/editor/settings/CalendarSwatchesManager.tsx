'use client';

import { useTranslate } from '@/i18n';
import { CALENDAR_COLOR_PALETTE, resolveSwatches } from '@/lib/calendar-color';

/**
 * The colours offered when a calendar is recoloured from the wall.
 *
 * The wall's sheet cannot show a colour mixer: the operating system's picker
 * opens a window the kiosk has no way to dismiss by touch. So the choice of
 * which sixteen colours are reachable has to be made somewhere with a
 * keyboard, which is here.
 *
 * Every slot is always filled, so this edits sixteen colours in place rather
 * than managing a list: there is no empty state to design, no way to end up
 * with a ragged last row in the sheet's grid, and resetting is one button
 * instead of a rebuild.
 */
export default function CalendarSwatchesManager({
  swatches,
  onChange,
}: {
  swatches: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
}) {
  const t = useTranslate('editor');
  const current = resolveSwatches(swatches);
  const isDefault = current.every((color, i) => color === CALENDAR_COLOR_PALETTE[i]);

  const setAt = (index: number, color: string) => {
    const next = current.map((existing, i) => (i === index ? color.toLowerCase() : existing));
    // Saved as the ship-with set means "unset", so a household that puts every
    // colour back gets the defaults again rather than a frozen copy of them
    // that stops following any later change.
    onChange(next.every((color, i) => color === CALENDAR_COLOR_PALETTE[i]) ? undefined : next);
  };

  return (
    <div className="space-y-3" data-field-id="calendar.swatches">
      <div className="flex flex-wrap gap-2">
        {current.map((color, index) => (
          <label
            key={index}
            className="relative h-9 w-9 shrink-0 cursor-pointer rounded-full border border-hs-border-strong"
            style={{ backgroundColor: color }}
          >
            <span className="sr-only">{t('settings.calendarPage.swatches.slot', { number: index + 1 })}</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setAt(index, e.target.value)}
              // The native input is the point here: this is the editor, on a
              // real computer, and it is the one place a colour can be mixed
              // rather than chosen from what is already offered.
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        ))}
      </div>
      {!isDefault && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-xs text-hs-text-muted hover:text-hs-text-body"
        >
          {t('settings.calendarPage.swatches.reset')}
        </button>
      )}
    </div>
  );
}
