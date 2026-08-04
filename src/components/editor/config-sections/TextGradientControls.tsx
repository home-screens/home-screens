'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import SectionHeading from '@/components/ui/SectionHeading';
import { useTranslate } from '@/i18n';
import type { ConfigControlsProps } from './config-controls';
import type { TextConfig } from '@/types/config';

export function TextGradientControls({ config: c, set }: ConfigControlsProps<TextConfig>) {
  const t = useTranslate('editor');
  const gradientOn = !!c.gradientEnabled;

  return (
    <>
      <SectionHeading>{t('configSections.text.sections.gradient')}</SectionHeading>

      <Toggle label={t('configSections.text.gradientText')} checked={gradientOn} onChange={(v) => set({ gradientEnabled: v })} />

      {gradientOn && (
        <>
          <ColorPicker
            label={t('configSections.text.gradientFrom')}
            value={(c.gradientFrom as string) || '#a78bfa'}
            onChange={(v) => set({ gradientFrom: v })}
          />
          <ColorPicker
            label={t('configSections.text.gradientTo')}
            value={(c.gradientTo as string) || '#22d3ee'}
            onChange={(v) => set({ gradientTo: v })}
          />
          <Slider
            label={t('configSections.text.gradientAngle')}
            value={c.gradientAngle ?? 90}
            min={0}
            max={360}
            step={15}
            displayValue={`${c.gradientAngle ?? 90}°`}
            onChange={(v) => set({ gradientAngle: v })}
          />
        </>
      )}
    </>
  );
}
