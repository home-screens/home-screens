'use client';

import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import SectionHeading from '@/components/ui/SectionHeading';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useTranslate } from '@/i18n';
import type { ConfigControlsProps } from './config-controls';
import type { TextConfig, TextEffect } from '@/types/config';

export function TextEffectControls({ config: c, set }: ConfigControlsProps<TextConfig>) {
  const t = useTranslate('editor');

  const EFFECT_OPTIONS: { value: TextEffect; label: string }[] = [
    { value: 'none', label: t('configSections.text.effectOptions.none') },
    { value: 'typewriter', label: t('configSections.text.effectOptions.typewriter') },
    { value: 'fade-in', label: t('configSections.text.effectOptions.fade-in') },
    { value: 'gradient-sweep', label: t('configSections.text.effectOptions.gradient-sweep') },
    { value: 'glow', label: t('configSections.text.effectOptions.glow') },
    { value: 'outline', label: t('configSections.text.effectOptions.outline') },
    { value: 'shadow', label: t('configSections.text.effectOptions.shadow') },
    { value: '3d', label: t('configSections.text.effectOptions.3d') },
    { value: 'neon', label: t('configSections.text.effectOptions.neon') },
    { value: 'wave', label: t('configSections.text.effectOptions.wave') },
    { value: 'bounce', label: t('configSections.text.effectOptions.bounce') },
    { value: 'shake', label: t('configSections.text.effectOptions.shake') },
    { value: 'color-cycle', label: t('configSections.text.effectOptions.color-cycle') },
  ];

  const effect = (c.effect as TextEffect) || 'none';

  return (
    <>
      <SectionHeading>{t('configSections.text.sections.effect')}</SectionHeading>

      <LabeledSelect
        label={t('configSections.text.effect')}
        value={effect}
        onChange={(v) => set({ effect: v })}
        options={EFFECT_OPTIONS}
      />

      {(effect === 'wave' || effect === 'bounce' || effect === 'shake' ||
        effect === 'glow' || effect === 'neon' || effect === 'gradient-sweep' ||
        effect === 'color-cycle') && (
        <Slider
          label={t('configSections.text.animationSpeed')}
          value={c.animationSpeed ?? 2}
          min={0.5}
          max={10}
          step={0.5}
          displayValue={`${(c.animationSpeed ?? 2).toFixed(1)}s`}
          onChange={(v) => set({ animationSpeed: v })}
        />
      )}

      {effect === 'outline' && (
        <>
          <Slider
            label={t('configSections.text.outlineWidth')}
            value={c.outlineWidth ?? 2}
            min={1}
            max={10}
            displayValue={`${c.outlineWidth ?? 2}px`}
            onChange={(v) => set({ outlineWidth: v })}
          />
          <ColorPicker
            label={t('configSections.text.outlineColor')}
            value={(c.outlineColor as string) || '#000000'}
            onChange={(v) => set({ outlineColor: v })}
          />
        </>
      )}

      {effect === 'shadow' && (
        <>
          <Slider
            label={t('configSections.text.shadowX')}
            value={c.shadowOffsetX ?? 2}
            min={-20}
            max={20}
            displayValue={`${c.shadowOffsetX ?? 2}px`}
            onChange={(v) => set({ shadowOffsetX: v })}
          />
          <Slider
            label={t('configSections.text.shadowY')}
            value={c.shadowOffsetY ?? 2}
            min={-20}
            max={20}
            displayValue={`${c.shadowOffsetY ?? 2}px`}
            onChange={(v) => set({ shadowOffsetY: v })}
          />
          <Slider
            label={t('configSections.text.shadowBlur')}
            value={c.shadowBlur ?? 4}
            min={0}
            max={40}
            displayValue={`${c.shadowBlur ?? 4}px`}
            onChange={(v) => set({ shadowBlur: v })}
          />
          <ColorPicker
            label={t('configSections.text.shadowColor')}
            value={(c.shadowColor as string) || 'rgba(0,0,0,0.5)'}
            onChange={(v) => set({ shadowColor: v })}
          />
        </>
      )}

      {effect === 'color-cycle' && (
        <ColorPalette
          palette={c.colorCyclePalette ?? ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7']}
          onChange={(palette) => set({ colorCyclePalette: palette })}
        />
      )}
    </>
  );
}

function ColorPalette({
  palette,
  onChange,
}: {
  palette: string[];
  onChange: (palette: string[]) => void;
}) {
  const t = useTranslate('editor');
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-hs-text-muted">{t('configSections.text.colorCyclePalette')}</span>
        <button
          type="button"
          onClick={() => onChange([...palette, '#ffffff'])}
          className="text-[10px] text-hs-text-faint hover:text-hs-text-secondary"
        >
          {t('configSections.text.addColor')}
        </button>
      </div>
      <div className="space-y-1">
        {palette.map((color, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <input
              type="color"
              value={color}
              onChange={(e) => {
                const next = [...palette];
                next[idx] = e.target.value;
                onChange(next);
              }}
              className="h-7 w-10 rounded border border-hs-border cursor-pointer"
            />
            <span className="text-[10px] text-hs-text-muted flex-1">{color}</span>
            {palette.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(palette.filter((_, i) => i !== idx))}
                className="text-[10px] text-hs-text-faint hover:text-red-400 px-1"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
