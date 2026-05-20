'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledField from '@/components/ui/LabeledField';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
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
  dateFormat?: string;
  showDayName?: boolean;
  showYear?: boolean;
  showWeekNumber?: boolean;
  showDayOfYear?: boolean;
  accentColor?: string;
};

export function DateConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<DateConfigType>(mod, screenId);

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
  const isCustomDateFormat = !DATE_PRESETS.some((p) => p.value === dateFormatVal);
  const [showCustomDate, setShowCustomDate] = useState(isCustomDateFormat);

  // Live date format preview
  let datePreview = '';
  try {
    datePreview = format(new Date(), dateFormatVal);
  } catch {
    datePreview = t('configSections.date.invalidFormat');
  }

  const has = (field: string) => fields.has(field);

  return (
    <>
      {/* View Selector */}
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Date Format (only for minimal view) */}
      {has('dateFormat') && (
        <div className="flex flex-col gap-1">
          <LabeledField label={t('configSections.date.dateFormat')}>
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
              <option value="__custom__">{t('configSections.date.customOption')}</option>
            </select>
          </LabeledField>
          {showCustomDate && (
            <input
              type="text"
              value={dateFormatVal}
              onChange={(e) => set({ dateFormat: e.target.value })}
              placeholder={t('configSections.date.dateFormatPlaceholder')}
              className={INPUT_CLASS}
            />
          )}
          <span className="text-xs text-hs-text-faint">{datePreview}</span>
        </div>
      )}

      {/* Show Day Name */}
      {has('showDayName') && (
        <Toggle label={t('configSections.date.showDayName')} checked={c.showDayName !== false} onChange={(v) => set({ showDayName: v })} />
      )}

      {/* Show Year */}
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

      {/* Accent Color */}
      {has('accentColor') && (
        <ColorPicker
          label={t('configSections.date.accentColor')}
          value={c.accentColor ?? '#22d3ee'}
          onChange={(v) => set({ accentColor: v })}
        />
      )}
    </>
  );
}
