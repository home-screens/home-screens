'use client';

import { useTranslate } from '@/i18n';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import { ShapeStrokeWidthSlider, ShapeCornerRadiusSlider } from './ShapeSliders';
import type { ShapeControlsProps } from './config-controls';
import type { ShapeConfig, ShapeView } from '@/types/config';

const FILLABLE_SHAPES = new Set<ShapeView>(['rectangle', 'circle', 'triangle', 'polygon', 'star', 'arrow']);
const ROTATABLE = new Set<ShapeView>(['triangle', 'polygon', 'star']);

export function ShapeGeometryControls({ config: c, set, view }: ShapeControlsProps) {
  const t = useTranslate('editor');

  const ARROW_DIRECTION_OPTIONS = [
    { value: 'right', label: t('configSections.shape.arrowRight') },
    { value: 'down',  label: t('configSections.shape.arrowDown') },
    { value: 'left',  label: t('configSections.shape.arrowLeft') },
    { value: 'up',    label: t('configSections.shape.arrowUp') },
  ] as const;

  return (
    <>
      {FILLABLE_SHAPES.has(view) && (
        <Toggle
          label={t('configSections.shape.outlineOnly')}
          checked={c.outline ?? false}
          onChange={(v) => set({ outline: v })}
        />
      )}

      {FILLABLE_SHAPES.has(view) && c.outline && (
        <ShapeStrokeWidthSlider config={c} set={set} />
      )}

      {(view === 'rectangle' || view === 'gradient') && (
        <ShapeCornerRadiusSlider config={c} set={set} />
      )}

      {view === 'polygon' && (
        <Slider
          label={t('configSections.shape.sides')}
          value={c.sides ?? 6}
          min={3}
          max={12}
          onChange={(v) => set({ sides: v })}
        />
      )}

      {view === 'star' && (
        <>
          <Slider
            label={t('configSections.shape.points')}
            value={c.starPoints ?? 5}
            min={3}
            max={12}
            onChange={(v) => set({ starPoints: v })}
          />
          <Slider
            label={t('configSections.shape.pointSharpness')}
            value={c.starInnerRatio ?? 0.4}
            min={0.2}
            max={0.8}
            step={0.05}
            displayValue={`${Math.round((c.starInnerRatio ?? 0.4) * 100)}%`}
            onChange={(v) => set({ starInnerRatio: v })}
          />
        </>
      )}

      {ROTATABLE.has(view) && (
        <Slider
          label={t('fields.rotation')}
          value={c.rotation ?? 0}
          min={0}
          max={360}
          step={5}
          displayValue={`${c.rotation ?? 0}°`}
          onChange={(v) => set({ rotation: v })}
        />
      )}

      {view === 'arrow' && (
        <>
          <LabeledSelect
            label={t('configSections.shape.direction')}
            value={c.arrowDirection ?? 'right'}
            onChange={(v) => set({ arrowDirection: v as ShapeConfig['arrowDirection'] })}
            options={ARROW_DIRECTION_OPTIONS}
          />
          <Slider
            label={t('configSections.shape.headSize')}
            value={c.arrowHeadRatio ?? 0.35}
            min={0.1}
            max={0.6}
            step={0.05}
            displayValue={`${Math.round((c.arrowHeadRatio ?? 0.35) * 100)}%`}
            onChange={(v) => set({ arrowHeadRatio: v })}
          />
        </>
      )}
    </>
  );
}
