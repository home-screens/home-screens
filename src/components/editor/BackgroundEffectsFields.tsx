'use client';

import type { BackgroundEffects } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import Slider from '@/components/ui/Slider';
import PropertyGroup from './PropertyGroup';
import { BACKGROUND_EFFECT_DEFAULTS, normalizeBackgroundEffects } from '@/lib/background-effects';

export default function BackgroundEffectsFields({ screenId, effects }: { screenId: string; effects?: BackgroundEffects }) {
  const t = useTranslate('editor');
  const updateScreenEffects = useEditorStore((state) => state.updateScreenEffects);
  const current = normalizeBackgroundEffects(effects);

  const updateEffects = (updates: Partial<BackgroundEffects>) => {
    updateScreenEffects(screenId, { ...current, ...updates });
  };

  return (
    <PropertyGroup title={t('backgroundPicker.effectsGroup')} accent={2}>
      <div className="space-y-2">
        <Slider
          label={t('backgroundPicker.effectsBrightnessLabel')}
          value={current.brightness}
          min={0}
          max={200}
          displayValue={`${current.brightness}%`}
          onChange={(value) => updateEffects({ brightness: value })}
          onReset={() => updateEffects({ brightness: BACKGROUND_EFFECT_DEFAULTS.brightness })}
        />
        <Slider
          label={t('backgroundPicker.effectsContrastLabel')}
          value={current.contrast}
          min={0}
          max={200}
          displayValue={`${current.contrast}%`}
          onChange={(value) => updateEffects({ contrast: value })}
          onReset={() => updateEffects({ contrast: BACKGROUND_EFFECT_DEFAULTS.contrast })}
        />
        <Slider
          label={t('backgroundPicker.effectsSaturationLabel')}
          value={current.saturation}
          min={0}
          max={200}
          displayValue={`${current.saturation}%`}
          onChange={(value) => updateEffects({ saturation: value })}
          onReset={() => updateEffects({ saturation: BACKGROUND_EFFECT_DEFAULTS.saturation })}
        />
        <Slider
          label={t('backgroundPicker.effectsWarmthLabel')}
          value={current.warmth}
          min={-100}
          max={100}
          displayValue={current.warmth > 0 ? `+${current.warmth}` : `${current.warmth}`}
          onChange={(value) => updateEffects({ warmth: value })}
          onReset={() => updateEffects({ warmth: BACKGROUND_EFFECT_DEFAULTS.warmth })}
        />
      </div>
    </PropertyGroup>
  );
}
