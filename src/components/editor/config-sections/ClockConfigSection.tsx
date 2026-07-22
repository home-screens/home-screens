'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledField from '@/components/ui/LabeledField';
import LabeledInput from '@/components/ui/LabeledInput';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { COMMON_TIMEZONES } from '@/lib/timezone';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { formatElapsed } from '@/components/modules/clock/elapsed-format';
import type { ModuleInstance, ClockView, WorldClockZone, ElapsedFormat, ElapsedPrecision } from '@/types/config';

// 50d 20h 13m 42s — a fixed sample duration (not tied to real time) used to
// preview the elapsed format/precision combo the admin has selected.
const SAMPLE_ELAPSED_MS =
  50 * 24 * 60 * 60 * 1000 + // days
  20 * 60 * 60 * 1000 + // hours
  13 * 60 * 1000 + // minutes
  42 * 1000; // seconds

// Shared across every timezone picker in the app — see `src/lib/timezone.ts`.

/** Which config fields are relevant for each view */
const VIEW_FIELDS: Record<ClockView, Set<string>> = {
  classic:     new Set(['format24h', 'showSeconds', 'showDate', 'dateFormat', 'weekDay']),
  digital:     new Set(['format24h', 'showSeconds', 'accentColor']),
  analog:      new Set(['showSeconds', 'showNumerals', 'accentColor']),
  minimal:     new Set(['format24h']),
  flip:        new Set(['format24h', 'showSeconds', 'animateFlip', 'accentColor']),
  word:        new Set(['showDate', 'dateFormat']),
  binary:      new Set(['format24h', 'showSeconds', 'accentColor']),
  vertical:    new Set(['format24h', 'showSeconds']),
  split:       new Set(['format24h', 'showSeconds', 'showDate', 'dateFormat', 'weekDay']),
  progress:    new Set(['format24h', 'showSeconds', 'accentColor']),
  fuzzy:       new Set(['showDate', 'dateFormat']),
  world:       new Set(['format24h', 'showSeconds', 'worldZones']),
  'dot-matrix': new Set(['format24h', 'showSeconds', 'showDate', 'dateFormat', 'weekDay', 'accentColor']),
  radial:      new Set(['format24h', 'showSeconds', 'accentColor']),
  arc:         new Set(['format24h', 'showSeconds', 'showDate', 'dateFormat', 'accentColor']),
  neon:        new Set(['format24h', 'showSeconds', 'showDate', 'dateFormat', 'weekDay', 'accentColor']),
  bar:         new Set(['format24h', 'showSeconds', 'accentColor']),
  elapsed:     new Set(['referenceTime', 'referenceLabel', 'countUp', 'accentColor', 'elapsedFormat', 'elapsedPrecision']),
};

type ClockConfigType = {
  view?: ClockView;
  format24h?: boolean;
  showSeconds?: boolean;
  showDate?: boolean;
  dateFormat?: string;
  showWeekNumber?: boolean;
  showDayOfYear?: boolean;
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

  // Filter out already-selected timezones from the dropdown
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

      {/* Format */}
      {has('format24h') && (
        <Toggle label={t('configSections.clock.format24h')} checked={!!c.format24h} onChange={(v) => set({ format24h: v })} />
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
    </>
  );
}
