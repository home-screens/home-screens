'use client';

import ColorPicker from '@/components/ui/ColorPicker';
import LabeledField from '@/components/ui/LabeledField';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance } from '@/types/config';

export function GarbageDayConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { config: c, set } = useModuleConfig<{
    trashDay?: number; trashFrequency?: string; trashStartDate?: string; trashColor?: string;
    recyclingDay?: number; recyclingFrequency?: string; recyclingStartDate?: string; recyclingColor?: string;
    customDay?: number; customFrequency?: string; customStartDate?: string; customColor?: string;
    customLabel?: string; highlightMode?: string;
  }>(mod, screenId);

  const FREQUENCY_OPTIONS = [
    { value: 'weekly', label: t('configSections.garbage-day.frequencyWeekly') },
    { value: 'biweekly', label: t('configSections.garbage-day.frequencyBiweekly') },
  ] as const;

  const HIGHLIGHT_OPTIONS = [
    { value: 'day-before', label: t('configSections.garbage-day.highlightDayBefore') },
    { value: 'day-of', label: t('configSections.garbage-day.highlightDayOf') },
  ] as const;

  const dayOptions = [
    { label: t('configSections.garbage-day.dayDisabled'), value: -1 },
    { label: tCore('days.sunday'), value: 0 },
    { label: tCore('days.monday'), value: 1 },
    { label: tCore('days.tuesday'), value: 2 },
    { label: tCore('days.wednesday'), value: 3 },
    { label: tCore('days.thursday'), value: 4 },
    { label: tCore('days.friday'), value: 5 },
    { label: tCore('days.saturday'), value: 6 },
  ];

  const defaultColors: Record<string, string> = { trash: '#6ee7b7', recycling: '#93c5fd', custom: '#fbbf24' };

  const wasteTypes = [
    { key: 'trash', label: t('configSections.garbage-day.trash'), day: c.trashDay, freq: c.trashFrequency, start: c.trashStartDate, color: c.trashColor },
    { key: 'recycling', label: t('configSections.garbage-day.recycling'), day: c.recyclingDay, freq: c.recyclingFrequency, start: c.recyclingStartDate, color: c.recyclingColor },
    { key: 'custom', label: c.customLabel || t('configSections.garbage-day.custom'), day: c.customDay, freq: c.customFrequency, start: c.customStartDate, color: c.customColor },
  ] as const;

  return (
    <>
      {wasteTypes.map(({ key, label, day, freq, start, color }) => (
        <div key={key} className="space-y-1.5 pb-2 border-b border-hs-border last:border-0">
          <LabeledField label={t('configSections.garbage-day.dayLabel', { label })}>
            <select className={INPUT_CLASS} value={day ?? -1} onChange={(e) => set({ [`${key}Day`]: Number(e.target.value) })}>
              {dayOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </LabeledField>
          {(day ?? -1) >= 0 && (
            <>
              <LabeledSelect
                label={t('configSections.garbage-day.frequency')}
                value={freq ?? 'weekly'}
                onChange={(v) => set({ [`${key}Frequency`]: v })}
                options={FREQUENCY_OPTIONS}
              />
              {freq === 'biweekly' && (
                <LabeledField label={t('configSections.garbage-day.knownDateLabel', { label: label.toLowerCase() })}>
                  <input type="date" className={INPUT_CLASS} value={start ?? ''} onChange={(e) => set({ [`${key}StartDate`]: e.target.value })} />
                  <span className="text-[10px] text-hs-text-faint">{t('configSections.garbage-day.knownDateHelp', { label: label.toLowerCase() })}</span>
                </LabeledField>
              )}
              <ColorPicker label={t('configSections.garbage-day.iconColor')} value={color || defaultColors[key]} onChange={(v) => set({ [`${key}Color`]: v })} />
            </>
          )}
        </div>
      ))}
      {(c.customDay ?? -1) >= 0 && (
        <LabeledInput
          label={t('configSections.garbage-day.customCategoryName')}
          value={c.customLabel ?? t('configSections.garbage-day.defaultCustomLabel')}
          onChange={(v) => set({ customLabel: v })}
        />
      )}
      <LabeledSelect
        label={t('configSections.garbage-day.highlightWhen')}
        value={c.highlightMode ?? 'day-before'}
        onChange={(v) => set({ highlightMode: v })}
        options={HIGHLIGHT_OPTIONS}
      />
    </>
  );
}
