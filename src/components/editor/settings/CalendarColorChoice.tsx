'use client';

import { useTranslate } from '@/i18n';
import { CALENDAR_COLOR_PALETTE } from '@/lib/calendar-color';
import { withCssColorAlpha } from '@/lib/hex-color';

/** Each palette colour's name, from the accent picker's names for the same eight. */
const COLOR_NAMES: Record<string, string> = {
  '#f97316': 'orange', '#a855f7': 'purple', '#3b82f6': 'blue', '#ef4444': 'red',
  '#10b981': 'green', '#f59e0b': 'amber', '#ec4899': 'pink', '#06b6d4': 'cyan',
};

/**
 * A calendar's colour in Settings > Calendar, the same for every kind: the
 * calendar's own colour first when Google or Apple gave it one, then the
 * eight colours every calendar is offered, then a box for any other colour.
 * Picking the calendar's own colour hands back `null`, which drops the
 * household's colour and leaves its name alone.
 */
export default function CalendarColorChoice({ value, own, label, onChange, customTestId }: {
  /** The household's colour, or `null` while the calendar shows its own. */
  value: string | null;
  /** The colour Google or Apple gave the calendar; calendar links have none. */
  own?: string;
  /** What the choice is for, read out by screen readers ("Color for Family"). */
  label: string;
  onChange: (color: string | null) => void;
  customTestId?: string;
}) {
  const t = useTranslate('editor');
  // Compared as #rrggbb: Apple can send #rgb, the colour box writes lowercase.
  const hex = (color: string | null | undefined) => (color ? withCssColorAlpha(color, 1) : null);
  const picked = hex(value);
  const ownHex = hex(own);
  const custom = picked !== null && !CALENDAR_COLOR_PALETTE.includes(picked);

  const swatch = (color: string, checked: boolean, title: string, choose: () => void, testId?: string) => (
    <button
      key={title + color}
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={title}
      title={title}
      onClick={choose}
      data-testid={testId}
      className={`h-5 w-5 shrink-0 rounded-full border border-black/15 transition-shadow ${checked ? 'ring-2 ring-hs-accent ring-offset-2 ring-offset-hs-card' : 'hover:ring-2 hover:ring-hs-border-strong'}`}
      style={{ backgroundColor: color }}
    />
  );

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
      {ownHex && (
        <>
          {swatch(ownHex, value === null, t('settings.calendarPage.appearance.ownColor'), () => onChange(null), 'calendar-color-own')}
          <span aria-hidden="true" className="h-4 w-px bg-hs-border-strong" />
        </>
      )}
      {CALENDAR_COLOR_PALETTE.map((color) => swatch(
        color,
        picked === color,
        COLOR_NAMES[color] ? t(`accentColorPicker.presets.${COLOR_NAMES[color]}`) : color,
        () => onChange(color),
      ))}
      <label
        title={t('settings.calendarPage.appearance.customColor')}
        className={`relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/15 ${custom ? 'ring-2 ring-hs-accent ring-offset-2 ring-offset-hs-card' : 'hover:ring-2 hover:ring-hs-border-strong'}`}
        // Any other colour: the colour itself once picked, a colour wheel until then.
        style={{ background: custom ? picked! : 'conic-gradient(#ef4444, #f59e0b, #10b981, #06b6d4, #3b82f6, #a855f7, #ef4444)' }}
      >
        <input
          type="color"
          value={picked ?? ownHex ?? '#888888'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t('settings.calendarPage.appearance.customColor')}
          data-testid={customTestId}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
