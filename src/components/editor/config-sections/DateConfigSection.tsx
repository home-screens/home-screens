'use client';

import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledField from '@/components/ui/LabeledField';
import ViewSelect from '@/components/editor/ViewSelect';
import DateFormatField from './DateFormatField';
import TimezoneSelect from '@/components/editor/TimezoneSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTZClock } from '@/hooks/useTZClock';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { formatDateSync, useFormattingLocale, useTranslate } from '@/i18n';
import { dateModulePattern } from '@/lib/date-module-format';
import type { ModuleInstance, DateView } from '@/types/config';

/** Which config fields are relevant for each view */
const VIEW_FIELDS: Record<DateView, Set<string>> = {
  full:      new Set(['showDayName', 'showYear', 'showWeekNumber', 'showDayOfYear', 'accentColor']),
  minimal:   new Set(['dateFormat', 'showWeekNumber', 'showDayOfYear']),
  stacked:   new Set(['showDayName', 'showYear', 'showWeekNumber', 'showDayOfYear', 'accentColor']),
  editorial: new Set(['showDayName', 'showYear', 'showWeekNumber', 'showDayOfYear', 'accentColor']),
  banner:    new Set(['showDayName', 'showYear', 'showWeekNumber', 'showDayOfYear', 'accentColor']),
};

type DateConfigType = {
  view?: DateView;
  timezone?: string;
  dateFormat?: string;
  showDayName?: boolean;
  showYear?: boolean;
  showWeekNumber?: boolean;
  showDayOfYear?: boolean;
  accentColor?: string;
};

export function DateConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();
  const { config: c, set } = useModuleConfig<DateConfigType>(mod, screenId);
  const globalTimezone = useEditorHouseholdTimezone();
  // The preview reads the date the module will show: its own zone, else the
  // household's, never the laptop's.
  const previewNow = useTZClock(c.timezone || globalTimezone);

  const VIEWS: { value: DateView; label: string }[] = [
    { value: 'full', label: t('configSections.date.viewFull') },
    { value: 'minimal', label: t('configSections.date.viewMinimal') },
    { value: 'stacked', label: t('configSections.date.viewStacked') },
    { value: 'editorial', label: t('configSections.date.viewEditorial') },
    { value: 'banner', label: t('configSections.date.viewBanner') },
  ];

  const DATE_PRESETS: { label: string; value: string }[] = [
    { label: t('configSections.date.datePresetMonthDay'), value: 'MMMM d' },
    { label: t('configSections.date.datePresetWeekdayMonthDay'), value: 'EEEE, MMMM d' },
    { label: t('configSections.date.datePresetShortWeekday'), value: 'EEE, MMM d' },
    { label: t('configSections.date.datePresetMonthDayYear'), value: 'MMMM d, yyyy' },
    { label: t('configSections.date.datePresetShortMonthDayYear'), value: 'MMM d, yyyy' },
    { label: t('configSections.date.datePresetSlashMDY'), value: 'MM/dd/yyyy' },
    { label: t('configSections.date.datePresetSlashDMY'), value: 'dd/MM/yyyy' },
    { label: t('configSections.date.datePresetIso'), value: 'yyyy-MM-dd' },
  ];

  const view = c.view ?? 'full';
  const fields = VIEW_FIELDS[view] ?? new Set<string>();
  const dateFormatVal = c.dateFormat ?? 'MMMM d';
  const has = (field: string) => fields.has(field);

  return (
    <>
      {/* View Selector */}
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Timezone — applies to every view */}
      <LabeledField as="div" label={t('configSections.date.timezone')}>
        <TimezoneSelect
          value={c.timezone ?? ''}
          onChange={(v) => set({ timezone: v })}
          defaultOptionLabel={globalTimezone
            ? t('configSections.timezoneUseDisplay', { timezone: globalTimezone })
            : t('configSections.timezoneUseDisplayNoZone')}
          ariaLabel={t('configSections.date.timezone')}
        />
      </LabeledField>

      {/* Date format (only for minimal view) */}
      {has('dateFormat') && (
        <DateFormatField
          label={t('configSections.date.dateFormat')}
          value={dateFormatVal}
          presets={DATE_PRESETS}
          onChange={(dateFormat) => set({ dateFormat })}
          format={(pattern) => formatDateSync(previewNow, dateModulePattern(pattern, locale), { locale })}
          words={{
            custom: t('configSections.date.customOption'),
            placeholder: t('configSections.date.dateFormatPlaceholder'),
            invalid: t('configSections.date.invalidFormat'),
            // The same pattern language as the clock's, so the same legend.
            examplesHeading: t('configSections.clock.customExamplesHeading'),
          }}
          testIdPrefix="date"
        />
      )}

      {/* Show day name */}
      {has('showDayName') && (
        <Toggle label={t('configSections.date.showDayName')} checked={c.showDayName !== false} onChange={(v) => set({ showDayName: v })} />
      )}

      {/* Show year */}
      {has('showYear') && (
        <Toggle label={t('configSections.date.showYear')} checked={!!c.showYear} onChange={(v) => set({ showYear: v })} />
      )}

      {/* Week/Day info */}
      {has('showWeekNumber') && (
        <Toggle label={t('configSections.date.showWeekNumber')} checked={!!c.showWeekNumber} onChange={(v) => set({ showWeekNumber: v })} />
      )}
      {has('showDayOfYear') && (
        <Toggle label={t('configSections.date.showDayOfYear')} checked={!!c.showDayOfYear} onChange={(v) => set({ showDayOfYear: v })} />
      )}

      {/* Accent color */}
      {has('accentColor') && (
        <ColorPicker
          label={t('configSections.date.accentColor')}
          swatches="accent"
          value={c.accentColor ?? '#22d3ee'}
          onChange={(v) => set({ accentColor: v })}
        />
      )}
    </>
  );
}
