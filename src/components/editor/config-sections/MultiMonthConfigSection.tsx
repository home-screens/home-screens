'use client';

import { useTranslate } from '@/i18n';
import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import LabeledSelect from '@/components/ui/LabeledSelect';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance } from '@/types/config';

export function MultiMonthConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<{ view?: string; monthCount?: number; startDay?: string; showWeekNumbers?: boolean; highlightWeekends?: boolean; showAdjacentDays?: boolean }>(mod, screenId);

  const START_DAY_OPTIONS = [
    { value: 'sunday', label: t('configSections.multi-month.startDaySunday') },
    { value: 'monday', label: t('configSections.multi-month.startDayMonday') },
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
      <Toggle label={t('configSections.multi-month.showWeekNumbers')} checked={c.showWeekNumbers === true} onChange={(v) => set({ showWeekNumbers: v })} />
      <Toggle label={t('configSections.multi-month.highlightWeekends')} checked={c.highlightWeekends !== false} onChange={(v) => set({ highlightWeekends: v })} />
      <Toggle label={t('configSections.multi-month.showAdjacentDays')} checked={c.showAdjacentDays !== false} onChange={(v) => set({ showAdjacentDays: v })} />
    </>
  );
}
