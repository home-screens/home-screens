'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import SectionHeading from '@/components/ui/SectionHeading';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useTranslate } from '@/i18n';
import type { ConfigControlsProps } from './config-controls';
import type { TextConfig, TextRevealOnRotation } from '@/types/config';

export function TextRotationControls({ config: c, set }: ConfigControlsProps<TextConfig>) {
  const t = useTranslate('editor');

  const REVEAL_OPTIONS: { value: TextRevealOnRotation; label: string }[] = [
    { value: 'none', label: t('configSections.text.revealOptions.none') },
    { value: 'fade', label: t('configSections.text.revealOptions.fade') },
    { value: 'slide-up', label: t('configSections.text.revealOptions.slide-up') },
    { value: 'slide-down', label: t('configSections.text.revealOptions.slide-down') },
    { value: 'zoom', label: t('configSections.text.revealOptions.zoom') },
  ];

  const rotationOn = !!c.rotationEnabled;

  return (
    <>
      <SectionHeading>{t('fields.rotation')}</SectionHeading>

      <Toggle label={t('configSections.text.slideshow')} checked={rotationOn} onChange={(v) => set({ rotationEnabled: v })} />
      {rotationOn && (
        <>
          <p className="text-[10px] text-hs-text-faint pl-1 leading-relaxed">
            {t('configSections.text.slidesHintPrefix')} <span className="font-mono text-hs-text-muted">---</span> {t('configSections.text.slidesHintSuffix')}
          </p>
          <Slider
            label={t('configSections.text.interval')}
            value={c.rotationIntervalMs ?? 5000}
            min={1000}
            max={30000}
            step={500}
            displayValue={`${((c.rotationIntervalMs ?? 5000) / 1000).toFixed(1)}s`}
            onChange={(v) => set({ rotationIntervalMs: v })}
          />
          <LabeledInput
            label={t('configSections.text.separator')}
            value={(c.rotationSeparator as string) || '---'}
            onChange={(v) => set({ rotationSeparator: v })}
          />
          <LabeledSelect
            label={t('configSections.text.revealAnimation')}
            value={(c.revealOnRotation as TextRevealOnRotation) || 'none'}
            onChange={(v) => set({ revealOnRotation: v })}
            options={REVEAL_OPTIONS}
          />
        </>
      )}
    </>
  );
}
