'use client';

import { useTranslate } from '@/i18n';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import type { ShapeControlsProps } from './config-controls';
import type { ShapeConfig, ShapeView } from '@/types/config';

function showsGradient(view: ShapeView): boolean {
  // glow uses a radial fade of `color`; gradient view forces gradient anyway —
  // both hide the fill-mode toggle.
  return view !== 'glow' && view !== 'gradient';
}

function showsColor(view: ShapeView, fillMode: ShapeConfig['fillMode']): boolean {
  if (view === 'gradient') return false;
  if (view === 'glow') return true; // glow always solid color
  return fillMode === 'solid';
}

function showsGradientPair(view: ShapeView, fillMode: ShapeConfig['fillMode']): boolean {
  if (view === 'gradient') return true;
  if (view === 'glow') return false;
  return fillMode === 'gradient';
}

export function ShapeFillControls({ config: c, set, view }: ShapeControlsProps) {
  const t = useTranslate('editor');
  const fillMode = c.fillMode ?? 'solid';

  const FILL_OPTIONS = [
    { value: 'solid',    label: t('configSections.shape.fillSolid') },
    { value: 'gradient', label: t('configSections.shape.fillGradient') },
  ] as const;

  return (
    <>
      {/* Fill mode toggle (hidden for glow/gradient — those have fixed paint behavior) */}
      {showsGradient(view) && (
        <LabeledSelect
          label={t('configSections.shape.fill')}
          value={fillMode}
          onChange={(v) => set({ fillMode: v as ShapeConfig['fillMode'] })}
          options={FILL_OPTIONS}
        />
      )}

      {showsColor(view, fillMode) && (
        <ColorPicker
          label={t('fields.color')}
          value={c.color ?? '#ffffff'}
          onChange={(v) => set({ color: v })}
        />
      )}

      {showsGradientPair(view, fillMode) && (
        <>
          <ColorPicker
            label={t('configSections.shape.gradientFrom')}
            value={c.gradientFrom ?? '#a78bfa'}
            onChange={(v) => set({ gradientFrom: v })}
          />
          <ColorPicker
            label={t('configSections.shape.gradientTo')}
            value={c.gradientTo ?? '#22d3ee'}
            onChange={(v) => set({ gradientTo: v })}
          />
          <Slider
            label={t('configSections.shape.gradientAngle')}
            value={c.gradientAngle ?? 90}
            min={0}
            max={360}
            step={5}
            displayValue={`${c.gradientAngle ?? 90}°`}
            onChange={(v) => set({ gradientAngle: v })}
          />
        </>
      )}
    </>
  );
}
