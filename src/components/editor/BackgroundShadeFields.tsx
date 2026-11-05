'use client';

import type { BackgroundShade } from '@/types/config';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import PropertyGroup from './PropertyGroup';

const fieldClass = 'mt-0.5 block w-full rounded bg-hs-card border border-hs-border-strong text-xs text-hs-text-body px-2 py-1 focus:outline-none focus:border-hs-accent';

export default function BackgroundShadeFields({ screenId, shade }: { screenId: string; shade?: BackgroundShade }) {
  const t = useTranslate('editor');
  const updateScreenShade = useEditorStore((state) => state.updateScreenShade);
  const shadeEnabled = shade?.enabled ?? false;
  const setShadeEnabled = (enabled: boolean) => {
    updateScreenShade(screenId, {
      enabled,
      style: shade?.style || 'topBottom',
      strength: shade?.strength ?? 40,
      color: shade?.color || '#000000',
    });
  };
  const updateShade = (updates: Partial<BackgroundShade>) => updateScreenShade(screenId, updates);

  return (
      <PropertyGroup title={t('backgroundPicker.shadeGroup')} accent={1}>
        <Toggle
          label={t('backgroundPicker.shadeEnable')}
          checked={shadeEnabled}
          onChange={setShadeEnabled}
        />
        {shadeEnabled && shade && (
          <div className="space-y-2 mt-2">
            <label className="block">
              <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.shadeStyleLabel')}</span>
              <select
                value={shade.style}
                onChange={(e) => updateShade({ style: e.target.value as BackgroundShade['style'] })}
                className={fieldClass}
              >
                <option value="even">{t('backgroundPicker.shadeStyles.even')}</option>
                <option value="topBottom">{t('backgroundPicker.shadeStyles.topBottom')}</option>
                <option value="edges">{t('backgroundPicker.shadeStyles.edges')}</option>
                <option value="both">{t('backgroundPicker.shadeStyles.both')}</option>
              </select>
            </label>
            <Slider
              label={t('backgroundPicker.shadeStrengthLabel')}
              value={shade.strength}
              min={0}
              max={100}
              step={5}
              displayValue={`${shade.strength}%`}
              onChange={(value) => updateShade({ strength: value })}
            />
            <ColorPicker
              label={t('backgroundPicker.shadeColorLabel')}
              value={shade.color}
              onChange={(value) => updateShade({ color: value })}
            />
          </div>
        )}
      </PropertyGroup>

  );
}
