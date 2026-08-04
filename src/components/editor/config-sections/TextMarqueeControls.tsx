'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import SectionHeading from '@/components/ui/SectionHeading';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useTranslate } from '@/i18n';
import type { ConfigControlsProps } from './config-controls';
import type { TextConfig } from '@/types/config';

export function TextMarqueeControls({ config: c, set }: ConfigControlsProps<TextConfig>) {
  const t = useTranslate('editor');

  const MARQUEE_DIRECTION_OPTIONS: { value: 'left' | 'right' | 'up' | 'down'; label: string }[] = [
    { value: 'left', label: t('configSections.text.marqueeDirectionOptions.left') },
    { value: 'right', label: t('configSections.text.marqueeDirectionOptions.right') },
    { value: 'up', label: t('configSections.text.marqueeDirectionOptions.up') },
    { value: 'down', label: t('configSections.text.marqueeDirectionOptions.down') },
  ];

  const marqueeOn = !!c.marquee;

  return (
    <>
      <SectionHeading>{t('configSections.text.sections.marquee')}</SectionHeading>

      <Toggle label={t('configSections.text.scrollingMarquee')} checked={marqueeOn} onChange={(v) => set({ marquee: v })} />

      {marqueeOn && (
        <>
          <LabeledSelect
            label={t('configSections.text.direction')}
            value={(c.marqueeDirection as 'left' | 'right' | 'up' | 'down') || 'left'}
            onChange={(v) => set({ marqueeDirection: v })}
            options={MARQUEE_DIRECTION_OPTIONS}
          />
          <Slider
            label={t('configSections.text.speed')}
            value={c.marqueeSpeed ?? 30}
            min={5}
            max={120}
            step={5}
            displayValue={`${c.marqueeSpeed ?? 30}s`}
            onChange={(v) => set({ marqueeSpeed: v })}
          />
        </>
      )}
    </>
  );
}
