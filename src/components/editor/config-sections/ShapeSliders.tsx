'use client';

import { useTranslate } from '@/i18n';
import Slider from '@/components/ui/Slider';
import type { ConfigControlsProps } from './config-controls';
import type { ShapeConfig } from '@/types/config';

export function ShapeStrokeWidthSlider({ config: c, set }: ConfigControlsProps<ShapeConfig>) {
  const t = useTranslate('editor');
  return (
    <Slider
      label={t('configSections.shape.strokeWidth')}
      value={c.strokeWidth ?? 2}
      min={0.5}
      max={20}
      step={0.5}
      displayValue={`${c.strokeWidth ?? 2}px`}
      onChange={(v) => set({ strokeWidth: v })}
    />
  );
}

export function ShapeCornerRadiusSlider({ config: c, set }: ConfigControlsProps<ShapeConfig>) {
  const t = useTranslate('editor');
  return (
    <Slider
      label={t('configSections.shape.cornerRadius')}
      value={c.cornerRadius ?? 12}
      min={0}
      max={120}
      displayValue={`${c.cornerRadius ?? 12}px`}
      onChange={(v) => set({ cornerRadius: v })}
    />
  );
}
