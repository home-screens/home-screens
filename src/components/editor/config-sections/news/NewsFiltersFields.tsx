'use client';

import LabeledSelect from '@/components/ui/LabeledSelect';
import LabeledTextarea from '@/components/ui/LabeledTextarea';
import SectionHeading from '@/components/ui/SectionHeading';
import Toggle from '@/components/ui/Toggle';
import { useTranslate } from '@/i18n';
import type { NewsSourceOptions, NewsTapAction } from '@/types/config';

const MAX_AGE_OPTIONS: { hours: number; key: string }[] = [
  { hours: 0, key: 'maxAgeAny' },
  { hours: 3, key: 'maxAge3h' },
  { hours: 6, key: 'maxAge6h' },
  { hours: 12, key: 'maxAge12h' },
  { hours: 24, key: 'maxAge1d' },
  { hours: 72, key: 'maxAge3d' },
  { hours: 168, key: 'maxAge1w' },
];

interface NewsFiltersFieldsProps {
  config: Partial<NewsSourceOptions>;
  set: (updates: Partial<NewsSourceOptions>) => void;
}

/** Word, age, order, and tap-action filters shared by both news modules. */
export function NewsFiltersFields({ config: c, set }: NewsFiltersFieldsProps) {
  const t = useTranslate('editor');

  const maxAgeOptions = MAX_AGE_OPTIONS.map((o) => ({
    value: String(o.hours),
    label: t(`configSections.news.${o.key}`),
  }));
  const currentAge = MAX_AGE_OPTIONS.some((o) => o.hours === (c.maxAgeHours ?? 0))
    ? String(c.maxAgeHours ?? 0)
    : '0';

  const TAP_OPTIONS: { value: NewsTapAction; label: string }[] = [
    { value: 'none', label: t('configSections.news.tapNone') },
    { value: 'qr', label: t('configSections.news.tapQr') },
    { value: 'details', label: t('configSections.news.tapDetails') },
  ];

  return (
    <>
      <SectionHeading>{t('configSections.news.filters')}</SectionHeading>
      <LabeledTextarea
        label={t('configSections.news.blockedWords')}
        value={c.blockedWords ?? ''}
        onChange={(v) => set({ blockedWords: v })}
        rows={2}
        placeholder={t('configSections.news.wordsPlaceholder')}
      />
      <LabeledTextarea
        label={t('configSections.news.requiredWords')}
        value={c.requiredWords ?? ''}
        onChange={(v) => set({ requiredWords: v })}
        rows={2}
        placeholder={t('configSections.news.wordsPlaceholder')}
      />
      <LabeledSelect
        label={t('configSections.news.maxAge')}
        value={currentAge}
        onChange={(v) => set({ maxAgeHours: Number(v) })}
        options={maxAgeOptions}
      />
      <Toggle
        label={t('configSections.news.preserveOrder')}
        checked={c.preserveOrder === true}
        onChange={(v) => set({ preserveOrder: v })}
      />
      <p className="text-[11px] text-hs-text-faint leading-relaxed">{t('configSections.news.preserveOrderHint')}</p>
      <LabeledSelect
        label={t('configSections.news.tapAction')}
        value={c.tapAction ?? 'qr'}
        onChange={(v) => set({ tapAction: v })}
        options={TAP_OPTIONS}
      />
    </>
  );
}
