'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledField from '@/components/ui/LabeledField';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import ViewSelect from '@/components/editor/ViewSelect';
import TimezoneSelect from '@/components/editor/TimezoneSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useEditorStore } from '@/stores/editor-store';
import { COMMON_TIMEZONES } from '@/lib/timezone';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { formatElapsed } from '@/components/modules/clock/elapsed-format';
import type { ModuleInstance, ClockView, ClockHourFormat, WorldClockZone, ElapsedFormat, ElapsedPrecision } from '@/types/config';
import { DEFAULT_TIME_FORMAT } from '@/types/config';

// 50d 20h 13m 42s — a fixed sample duration (not tied to real time) used to
// preview the elapsed format/precision combo the admin has selected.
/** Three patterns that cover the shapes people ask for, shown with today's
 *  date next to them so "EEEE" stops being a guess. */
const CUSTOM_DATE_EXAMPLES = ['EEEE, MMMM d', 'EEE d MMM', 'd/M/yyyy'];

function safeFormat(pattern: string, t: (key: string) => string): string {
  try {
    return format(new Date(), pattern);
  } catch {
    return t('configSections.clock.invalidFormat');
  }
}

const SAMPLE_ELAPSED_MS =
  50 * 24 * 60 * 60 * 1000 +
  20 * 60 * 60 * 1000 +
  13 * 60 * 1000 +
  42 * 1000;

// Shared across every timezone picker in the app — see `src/lib/timezone.ts`.

/** Which config fields are relevant for each view */
const VIEW_FIELDS: Record<ClockView, Set<string>> = {
  classic:     new Set(['hourFormat', 'showSeconds', 'showDate', 'dateFormat', 'weekDay']),
  digital:     new Set(['hourFormat', 'showSeconds', 'accentColor']),
  analog:      new Set(['showSeconds', 'showNumerals', 'accentColor']),
  minimal:     new Set(['hourFormat', 'showAmPm']),
  flip:        new Set(['hourFormat', 'showSeconds', 'animateFlip', 'accentColor']),
  word:        new Set(['showDate', 'dateFormat']),
  binary:      new Set(['hourFormat', 'showSeconds', 'accentColor']),
  vertical:    new Set(['hourFormat', 'showSeconds']),
  split:       new Set(['hourFormat', 'showSeconds', 'showDate', 'dateFormat', 'weekDay']),
  progress:    new Set(['hourFormat', 'showSeconds', 'accentColor']),
  fuzzy:       new Set(['showDate', 'dateFormat']),
  world:       new Set(['hourFormat', 'showSeconds', 'worldZones']),
  'dot-matrix': new Set(['hourFormat', 'showSeconds', 'showDate', 'dateFormat', 'weekDay', 'accentColor']),
  radial:      new Set(['hourFormat', 'showSeconds', 'accentColor']),
  arc:         new Set(['hourFormat', 'showSeconds', 'showDate', 'dateFormat', 'accentColor']),
  neon:        new Set(['hourFormat', 'showSeconds', 'showDate', 'dateFormat', 'weekDay', 'accentColor']),
  bar:         new Set(['hourFormat', 'showSeconds', 'accentColor']),
  elapsed:     new Set(['referenceTime', 'referenceLabel', 'countUp', 'accentColor', 'elapsedFormat', 'elapsedPrecision']),
};

type ClockConfigType = {
  view?: ClockView;
  timezone?: string;
  format24h?: boolean;
  hourFormat?: ClockHourFormat;
  showSeconds?: boolean;
  showDate?: boolean;
  dateFormat?: string;
  showWeekNumber?: boolean;
  showDayOfYear?: boolean;
  alignment?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'center' | 'bottom';
  sizeMode?: 'fit' | 'fixed';
  showAmPm?: boolean;
  showNumerals?: boolean;
  animateFlip?: boolean;
  accentColor?: string;
  worldZones?: WorldClockZone[];
  referenceTime?: string;
  referenceLabel?: string;
  countUp?: boolean;
  elapsedFormat?: ElapsedFormat;
  elapsedPrecision?: ElapsedPrecision;
};

export function ClockConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const { config: c, set } = useModuleConfig<ClockConfigType>(mod, screenId);
  const globalTimezone = useEditorStore((s) => s.config?.settings?.timezone);
  const householdTimeFormat = useEditorStore((s) => s.config?.settings?.timeFormat) ?? DEFAULT_TIME_FORMAT;
  // A clock placed before `hourFormat` existed shows its own toggle's value,
  // which is what it renders; picking anything writes `hourFormat` and the
  // toggle is never read again (see resolveClockFormat24h).
  const hourFormat: ClockHourFormat = c.hourFormat ?? (c.format24h ? '24h' : '12h');
  const householdLabel = t(householdTimeFormat === '24h' ? 'configSections.clock.hourFormat24h' : 'configSections.clock.hourFormat12h');

  const VIEWS: { value: ClockView; label: string }[] = [
    { value: 'classic', label: t('configSections.clock.viewClassic') },
    { value: 'digital', label: t('configSections.clock.viewDigital') },
    { value: 'analog', label: t('configSections.clock.viewAnalog') },
    { value: 'minimal', label: t('configSections.clock.viewMinimal') },
    { value: 'flip', label: t('configSections.clock.viewFlip') },
    { value: 'word', label: t('configSections.clock.viewWord') },
    { value: 'binary', label: t('configSections.clock.viewBinary') },
    { value: 'vertical', label: t('configSections.clock.viewVertical') },
    { value: 'split', label: t('configSections.clock.viewSplit') },
    { value: 'progress', label: t('configSections.clock.viewProgress') },
    { value: 'fuzzy', label: t('configSections.clock.viewFuzzy') },
    { value: 'world', label: t('configSections.clock.viewWorld') },
    { value: 'dot-matrix', label: t('configSections.clock.viewDotMatrix') },
    { value: 'radial', label: t('configSections.clock.viewRadial') },
    { value: 'arc', label: t('configSections.clock.viewArc') },
    { value: 'neon', label: t('configSections.clock.viewNeon') },
    { value: 'bar', label: t('configSections.clock.viewBar') },
    { value: 'elapsed', label: t('configSections.clock.viewElapsed') },
  ];

  const DATE_PRESETS: { label: string; value: string }[] = [
    { label: t('configSections.clock.datePresetWeekdayMonthDay'), value: 'EEEE, MMMM d' },
    { label: t('configSections.clock.datePresetShortWeekday'), value: 'EEE, MMM d' },
    { label: t('configSections.clock.datePresetMonthDayYear'), value: 'MMMM d, yyyy' },
    { label: t('configSections.clock.datePresetShortMonthDayYear'), value: 'MMM d, yyyy' },
    { label: t('configSections.clock.datePresetSlashMDY'), value: 'MM/dd/yyyy' },
    { label: t('configSections.clock.datePresetSlashDMY'), value: 'dd/MM/yyyy' },
    { label: t('configSections.clock.datePresetIso'), value: 'yyyy-MM-dd' },
    { label: t('configSections.clock.datePresetWeekday'), value: 'EEEE' },
  ];

  const ELAPSED_FORMATS: { value: ElapsedFormat; label: string }[] = [
    { value: 'units', label: t('configSections.clock.formatUnits') },
    { value: 'unitsUpper', label: t('configSections.clock.formatUnitsUpper') },
    { value: 'unitsShort', label: t('configSections.clock.formatUnitsShort') },
    { value: 'colon', label: t('configSections.clock.formatColon') },
    { value: 'words', label: t('configSections.clock.formatWords') },
    { value: 'wordsTitle', label: t('configSections.clock.formatWordsTitle') },
  ];

  const ELAPSED_PRECISIONS: { value: ElapsedPrecision; label: string }[] = [
    { value: 'auto', label: t('configSections.clock.precisionAuto') },
    { value: 'days', label: t('configSections.clock.precisionDays') },
    { value: 'daysHours', label: t('configSections.clock.precisionDaysHours') },
    { value: 'daysHoursMinutes', label: t('configSections.clock.precisionDaysHoursMinutes') },
    { value: 'daysHoursMinutesSeconds', label: t('configSections.clock.precisionDaysHoursMinutesSeconds') },
  ];

  const ALIGNMENT_OPTIONS: { value: 'left' | 'center' | 'right'; label: string }[] = [
    { value: 'left', label: t('configSections.text.alignmentOptions.left') },
    { value: 'center', label: t('configSections.text.alignmentOptions.center') },
    { value: 'right', label: t('configSections.text.alignmentOptions.right') },
  ];

  const VERTICAL_ALIGN_OPTIONS: { value: 'top' | 'center' | 'bottom'; label: string }[] = [
    { value: 'top', label: t('configSections.text.verticalAlignOptions.top') },
    { value: 'center', label: t('configSections.text.verticalAlignOptions.center') },
    { value: 'bottom', label: t('configSections.text.verticalAlignOptions.bottom') },
  ];

  const SIZE_MODE_OPTIONS: { value: 'fit' | 'fixed'; label: string }[] = [
    { value: 'fit', label: t('configSections.clock.sizeModeFit') },
    { value: 'fixed', label: t('configSections.clock.sizeModeFixed') },
  ];

  const view = c.view ?? 'classic';
  const fields = VIEW_FIELDS[view] ?? new Set<string>();
  const dateFormatVal = c.dateFormat ?? 'EEEE, MMMM d';
  const isCustomDateFormat = !DATE_PRESETS.some((p) => p.value === dateFormatVal);
  const [showCustomDate, setShowCustomDate] = useState(isCustomDateFormat);

  const worldZones = useMemo(() => c.worldZones ?? [], [c.worldZones]);

  // Live date format preview
  let datePreview = '';
  try {
    datePreview = format(new Date(), dateFormatVal);
  } catch {
    datePreview = t('configSections.clock.invalidFormat');
  }

  const has = (field: string) => fields.has(field);

  const elapsedFormatVal = c.elapsedFormat ?? 'units';
  const elapsedPrecisionVal = c.elapsedPrecision ?? 'auto';
  const elapsedPreview = formatElapsed(SAMPLE_ELAPSED_MS, elapsedFormatVal, elapsedPrecisionVal, formattingLocale);

  const availableZones = useMemo(
    () => COMMON_TIMEZONES.filter((tz) => !worldZones.some((wz) => wz.timezone === tz.value)),
    [worldZones],
  );

  const addZone = (tzValue: string) => {
    if (!tzValue || worldZones.length >= 3) return;
    const option = COMMON_TIMEZONES.find((tz) => tz.value === tzValue);
    if (!option) return;
    set({ worldZones: [...worldZones, { label: option.label, timezone: option.value }] });
  };

  const removeZone = (index: number) => {
    set({ worldZones: worldZones.filter((_, i) => i !== index) });
  };

  return (
    <>
      {/* View Selector */}
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Timezone — applies to every view */}
      <LabeledField as="div" label={t('configSections.clock.timezone')}>
        <TimezoneSelect
          value={c.timezone ?? ''}
          onChange={(v) => set({ timezone: v })}
          defaultOptionLabel={globalTimezone
            ? t('configSections.timezoneUseDisplay', { timezone: globalTimezone })
            : t('configSections.timezoneUseDisplayNoZone')}
          ariaLabel={t('configSections.clock.timezone')}
        />
      </LabeledField>

      {/* Format */}
      {has('hourFormat') && (
        <LabeledField label={t('configSections.clock.hourFormat')}>
          <select
            value={hourFormat}
            onChange={(e) => set({ hourFormat: e.target.value as ClockHourFormat })}
            className={INPUT_CLASS}
            aria-label={t('configSections.clock.hourFormat')}
          >
            <option value="inherit">{t('configSections.clock.hourFormatInherit', { format: householdLabel })}</option>
            <option value="12h">{t('configSections.clock.hourFormat12h')}</option>
            <option value="24h">{t('configSections.clock.hourFormat24h')}</option>
          </select>
        </LabeledField>
      )}

      {/* Minimal: AM/PM suffix (off by default, so existing Minimal clocks keep the bare time) */}
      {has('showAmPm') && (
        <Toggle label={t('configSections.clock.showAmPm')} checked={!!c.showAmPm} onChange={(v) => set({ showAmPm: v })} />
      )}

      {/* Seconds */}
      {has('showSeconds') && (
        <Toggle label={t('configSections.clock.showSeconds')} checked={c.showSeconds !== false} onChange={(v) => set({ showSeconds: v })} />
      )}

      {/* Show Date */}
      {has('showDate') && (
        <Toggle label={t('configSections.clock.showDate')} checked={c.showDate !== false} onChange={(v) => set({ showDate: v })} />
      )}

      {/* Date Format (preset dropdown + custom input + live preview) */}
      {has('dateFormat') && (
        <div className="flex flex-col gap-1">
          <LabeledField label={t('configSections.clock.dateFormat')}>
            <select
              value={showCustomDate ? '__custom__' : dateFormatVal}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setShowCustomDate(true);
                } else {
                  setShowCustomDate(false);
                  set({ dateFormat: e.target.value });
                }
              }}
              className={INPUT_CLASS}
            >
              {DATE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
              <option value="__custom__">{t('configSections.clock.customOption')}</option>
            </select>
          </LabeledField>
          {showCustomDate && (
            <input
              type="text"
              value={dateFormatVal}
              onChange={(e) => set({ dateFormat: e.target.value })}
              placeholder={t('configSections.clock.dateFormatPlaceholder')}
              className={INPUT_CLASS}
            />
          )}
          <span className="text-xs text-hs-text-faint">{datePreview}</span>
          {/* A pattern language with no legend is a dead end. Three worked
              examples, rendered against today's date, are enough to get from
              "what do I type" to a format that works. */}
          {showCustomDate && (
            <div className="mt-1 border-t border-hs-border pt-2" data-testid="clock-format-examples">
              <p className="text-[11px] text-hs-text-faint mb-1">
                {t('configSections.clock.customExamplesHeading')}
              </p>
              {CUSTOM_DATE_EXAMPLES.map((pattern) => (
                <button
                  key={pattern}
                  type="button"
                  onClick={() => set({ dateFormat: pattern })}
                  className="flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 text-left hover:bg-hs-hover transition-colors"
                >
                  <code className="font-mono text-[11px] text-hs-text-secondary">{pattern}</code>
                  <span className="text-[11px] text-hs-text-faint">
                    {safeFormat(pattern, t)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Week/Day info */}
      {has('weekDay') && (
        <>
          <Toggle label={t('configSections.clock.showWeekNumber')} checked={!!c.showWeekNumber} onChange={(v) => set({ showWeekNumber: v })} />
          <Toggle label={t('configSections.clock.showDayOfYear')} checked={!!c.showDayOfYear} onChange={(v) => set({ showDayOfYear: v })} />
        </>
      )}

      {/* Analog: show numerals */}
      {has('showNumerals') && (
        <Toggle label={t('configSections.clock.showHourNumbers')} checked={!!c.showNumerals} onChange={(v) => set({ showNumerals: v })} />
      )}

      {/* Flip: animate */}
      {has('animateFlip') && (
        <Toggle label={t('configSections.clock.flipAnimation')} checked={c.animateFlip !== false} onChange={(v) => set({ animateFlip: v })} />
      )}

      {/* Accent Color */}
      {has('accentColor') && (
        <ColorPicker
          label={t('configSections.clock.accentColor')}
          value={c.accentColor ?? '#22d3ee'}
          onChange={(v) => set({ accentColor: v })}
        />
      )}

      {/* World: timezone list */}
      {has('worldZones') && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-hs-text-muted">{t('configSections.clock.timeZonesCount', { count: worldZones.length, max: 3 })}</span>
          {worldZones.map((zone, i) => (
            <div key={i} className="flex items-center gap-1 text-xs bg-hs-card rounded p-1.5">
              <span className="flex-1 text-hs-text-secondary">{zone.label} — {zone.timezone}</span>
              <button
                type="button"
                onClick={() => removeZone(i)}
                className="text-hs-text-faint hover:text-hs-danger shrink-0"
              >
                &times;
              </button>
            </div>
          ))}
          {worldZones.length < 3 && availableZones.length > 0 && (
            <select
              value=""
              onChange={(e) => addZone(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">{t('configSections.clock.addTimezone')}</option>
              {availableZones.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Elapsed: reference time config */}
      {has('referenceTime') && (
        <>
          <LabeledInput
            label={t('configSections.clock.referenceTime')}
            type="datetime-local"
            value={c.referenceTime ?? ''}
            onChange={(v) => set({ referenceTime: v })}
          />
          {c.timezone && (
            <span className="text-xs text-hs-text-faint">
              {t('configSections.clock.referenceTimezoneHint', { timezone: c.timezone })}
            </span>
          )}
          <LabeledInput
            label={t('configSections.clock.referenceLabel')}
            value={c.referenceLabel ?? ''}
            onChange={(v) => set({ referenceLabel: v })}
            placeholder={t('configSections.clock.referenceLabelPlaceholder')}
          />
          <Toggle
            label={t('configSections.clock.countUp')}
            checked={c.countUp !== false}
            onChange={(v) => set({ countUp: v })}
          />
        </>
      )}

      {/* Elapsed: format + precision */}
      {has('elapsedFormat') && (
        <div className="flex flex-col gap-1">
          <LabeledField label={t('configSections.clock.elapsedFormat')}>
            <select
              value={elapsedFormatVal}
              onChange={(e) => set({ elapsedFormat: e.target.value as ElapsedFormat })}
              className={INPUT_CLASS}
            >
              {ELAPSED_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label={t('configSections.clock.elapsedPrecision')}>
            <select
              value={elapsedPrecisionVal}
              onChange={(e) => set({ elapsedPrecision: e.target.value as ElapsedPrecision })}
              className={INPUT_CLASS}
            >
              {ELAPSED_PRECISIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </LabeledField>
          <span className="text-xs text-hs-text-faint">{elapsedPreview}</span>
        </div>
      )}

      {/* Size and placement, every view. Fixed: the box only places the clock
          and Text size (Style) alone sets how big it is. A clock pinned to a
          corner grows out of that corner when it is bigger than the box. */}
      <div className="flex flex-col gap-1">
        <LabeledSelect
          label={t('configSections.clock.sizeMode')}
          value={c.sizeMode ?? 'fit'}
          onChange={(v) => set({ sizeMode: v })}
          options={SIZE_MODE_OPTIONS}
        />
        {c.sizeMode === 'fixed' && (
          <span className="text-xs text-hs-text-faint">{t('configSections.clock.sizeModeFixedHint')}</span>
        )}
      </div>
      <LabeledSelect
        label={t('configSections.clock.alignment')}
        value={c.alignment ?? 'center'}
        onChange={(v) => set({ alignment: v })}
        options={ALIGNMENT_OPTIONS}
      />
      <LabeledSelect
        label={t('configSections.clock.verticalAlign')}
        value={c.verticalAlign ?? 'center'}
        onChange={(v) => set({ verticalAlign: v })}
        options={VERTICAL_ALIGN_OPTIONS}
      />
    </>
  );
}
