'use client';

import { useTranslate } from '@/i18n';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import type { ShapeControlsProps } from './config-controls';
import type { ShapeConfig } from '@/types/config';

export function ShapeAtmosphericControls({ config: c, set, view }: ShapeControlsProps) {
  const t = useTranslate('editor');

  const GRID_PATTERN_OPTIONS = [
    { value: 'dots',  label: t('configSections.shape.gridDots') },
    { value: 'lines', label: t('configSections.shape.gridLines') },
    { value: 'cross', label: t('configSections.shape.gridCross') },
  ] as const;

  return (
    <>
      {view === 'glow' && (
        <>
          <Slider
            label={t('configSections.shape.intensity')}
            value={c.intensity ?? 0.55}
            min={0}
            max={1}
            step={0.05}
            displayValue={`${Math.round((c.intensity ?? 0.55) * 100)}%`}
            onChange={(v) => set({ intensity: v })}
          />
          <Slider
            label={t('configSections.shape.softness')}
            value={c.softness ?? 0.55}
            min={0.2}
            max={1}
            step={0.05}
            displayValue={`${Math.round((c.softness ?? 0.55) * 100)}%`}
            onChange={(v) => set({ softness: v })}
          />
        </>
      )}

      {view === 'grid' && (
        <>
          <LabeledSelect
            label={t('configSections.shape.pattern')}
            value={c.gridPattern ?? 'dots'}
            onChange={(v) => set({ gridPattern: v as ShapeConfig['gridPattern'] })}
            options={GRID_PATTERN_OPTIONS}
          />
          <Slider
            label={t('configSections.shape.spacing')}
            value={c.gridSpacing ?? 24}
            min={4}
            max={120}
            displayValue={`${c.gridSpacing ?? 24}px`}
            onChange={(v) => set({ gridSpacing: v })}
          />
          <Slider
            label={t('configSections.shape.markSize')}
            value={c.gridDotSize ?? 2}
            min={0.5}
            max={20}
            step={0.5}
            displayValue={`${c.gridDotSize ?? 2}px`}
            onChange={(v) => set({ gridDotSize: v })}
          />
        </>
      )}
    </>
  );
}
