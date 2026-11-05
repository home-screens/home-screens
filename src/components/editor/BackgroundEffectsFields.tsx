'use client';

import type { BackgroundEffects } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import Slider from '@/components/ui/Slider';
import PropertyGroup from './PropertyGroup';
import { BACKGROUND_EFFECT_DEFAULTS, normalizeBackgroundEffects } from '@/lib/background-effects';

/**
 * Brightness, contrast, saturation and warmth for the picture behind a
 * screen. Each slider sends only its own field; the store merges it onto the
 * live set and drops a field that is back at its default, so Reset is just
 * "send the default".
 */
export default function BackgroundEffectsFields({ screenId, effects }: { screenId: string; effects?: BackgroundEffects }) {
  const t = useTranslate('editor');
  const updateScreenEffects = useEditorStore((state) => state.updateScreenEffects);
  const current = normalizeBackgroundEffects(effects);

  const slider = (field: keyof BackgroundEffects, label: string, min: number, max: number, display: (value: number) => string) => (
    <Slider
      label={label}
      value={current[field]}
      min={min}
      max={max}
      displayValue={display(current[field])}
      onChange={(value) => updateScreenEffects(screenId, { [field]: value })}
      onReset={() => updateScreenEffects(screenId, { [field]: BACKGROUND_EFFECT_DEFAULTS[field] })}
      resetLabel={t('backgroundPicker.effectsReset')}
      resetTitle={t('backgroundPicker.effectsResetLabel', { label })}
    />
  );
  const percent = (value: number) => `${value}%`;
  const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

  return (
    <PropertyGroup title={t('backgroundPicker.effectsGroup')} accent={2}>
      <div className="space-y-2">
        {slider('brightness', t('backgroundPicker.effectsBrightnessLabel'), 0, 200, percent)}
        {slider('contrast', t('backgroundPicker.effectsContrastLabel'), 0, 200, percent)}
        {slider('saturation', t('backgroundPicker.effectsSaturationLabel'), 0, 200, percent)}
        {slider('warmth', t('backgroundPicker.effectsWarmthLabel'), -100, 100, signed)}
      </div>
    </PropertyGroup>
  );
}
