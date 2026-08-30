'use client';

import { useTranslate } from '@/i18n';
import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import LabeledSelect from '@/components/ui/LabeledSelect';
import ColorPicker from '@/components/ui/ColorPicker';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { DEFAULT_CALENDAR_ACCENT } from '@/lib/calendar-color';
import type { ModuleInstance, MultiMonthTodayStyle } from '@/types/config';

export function MultiMonthConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { config: c, set } = useModuleConfig<{ view?: string; monthCount?: number; startDay?: string; showWeekNumbers?: boolean; highlightWeekends?: boolean; showAdjacentDays?: boolean; showCurrentMonthLabel?: boolean; todayStyle?: MultiMonthTodayStyle; accentColor?: string }>(mod, screenId);

  const TODAY_STYLE_OPTIONS: { value: MultiMonthTodayStyle; label: string }[] = [
    { value: 'filled', label: t('configSections.multi-month.todayFilled') },
    { value: 'square', label: t('configSections.multi-month.todaySquare') },
    { value: 'outline', label: t('configSections.multi-month.todayOutline') },
    { value: 'underline', label: t('configSections.multi-month.todayUnderline') },
    { value: 'text', label: t('configSections.multi-month.todayText') },
    { value: 'none', label: t('configSections.multi-month.todayNone') },
  ];

  const START_DAY_OPTIONS = [
    { value: 'sunday', label: tCore('days.sunday') },
    { value: 'monday', label: tCore('days.monday') },
  ] as const;

  return (
    <>
      <ViewSelect
        label={t('configSections.multi-month.layout')}
        value={c.view ?? 'vertical'}
        onChange={(v) => set({ view: v })}
        options={[
          { value: 'vertical', label: t('configSections.multi-month.layoutVertical') },
          { value: 'horizontal', label: t('configSections.multi-month.layoutHorizontal') },
        ]}
      />
      <Slider label={t('configSections.multi-month.monthsToShow')} value={c.monthCount ?? 3} min={1} max={6} step={1} onChange={(v) => set({ monthCount: v })} />
      <LabeledSelect
        label={t('configSections.multi-month.weekStartsOn')}
        value={c.startDay ?? 'sunday'}
        onChange={(v) => set({ startDay: v })}
        options={START_DAY_OPTIONS}
      />
      <Toggle label={t('configSections.multi-month.showCurrentMonthLabel')} checked={c.showCurrentMonthLabel !== false} onChange={(v) => set({ showCurrentMonthLabel: v })} />
      <Toggle label={t('configSections.multi-month.showWeekNumbers')} checked={c.showWeekNumbers === true} onChange={(v) => set({ showWeekNumbers: v })} />
      <Toggle label={t('configSections.multi-month.highlightWeekends')} checked={c.highlightWeekends !== false} onChange={(v) => set({ highlightWeekends: v })} />
      <Toggle label={t('configSections.multi-month.showAdjacentDays')} checked={c.showAdjacentDays !== false} onChange={(v) => set({ showAdjacentDays: v })} />
      <LabeledSelect
        label={t('configSections.multi-month.todayHighlight')}
        value={c.todayStyle ?? 'filled'}
        onChange={(v) => set({ todayStyle: v })}
        options={TODAY_STYLE_OPTIONS}
      />
      {(c.todayStyle ?? 'filled') !== 'none' && (
        <ColorPicker
          label={t('configSections.multi-month.accentColor')}
          value={c.accentColor ?? DEFAULT_CALENDAR_ACCENT}
          onChange={(v) => set({ accentColor: v })}
          defaultValue={DEFAULT_CALENDAR_ACCENT}
          resetLabel={t('common.resetToDefault')}
        />
      )}
    </>
  );
}
