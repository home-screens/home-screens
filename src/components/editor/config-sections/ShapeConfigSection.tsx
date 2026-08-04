'use client';

import { useTranslate } from '@/i18n';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { ShapeFillControls } from './ShapeFillControls';
import { ShapeLineControls } from './ShapeLineControls';
import { ShapeGeometryControls } from './ShapeGeometryControls';
import { ShapeAtmosphericControls } from './ShapeAtmosphericControls';
import { ShapeFrameControls } from './ShapeFrameControls';
import type { ModuleInstance, ShapeConfig, ShapeView } from '@/types/config';

export function ShapeConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<ShapeConfig>(mod, screenId);
  const view: ShapeView = c.view ?? 'divider';

  const VIEW_OPTIONS = [
    { value: 'divider',     label: t('configSections.shape.viewDivider') },
    { value: 'double-line', label: t('configSections.shape.viewDoubleLine') },
    { value: 'wave',        label: t('configSections.shape.viewWave') },
    { value: 'zigzag',      label: t('configSections.shape.viewZigzag') },
    { value: 'dotted-row',  label: t('configSections.shape.viewDottedRow') },
    { value: 'rectangle',   label: t('configSections.shape.viewRectangle') },
    { value: 'circle',      label: t('configSections.shape.viewCircle') },
    { value: 'triangle',    label: t('configSections.shape.viewTriangle') },
    { value: 'polygon',     label: t('configSections.shape.viewPolygon') },
    { value: 'star',        label: t('configSections.shape.viewStar') },
    { value: 'arrow',       label: t('configSections.shape.viewArrow') },
    { value: 'glow',        label: t('configSections.shape.viewGlow') },
    { value: 'gradient',    label: t('configSections.shape.viewGradient') },
    { value: 'grid',        label: t('configSections.shape.viewGrid') },
    { value: 'frame',       label: t('configSections.shape.viewFrame') },
  ] as const;

  return (
    <>
      <LabeledSelect
        label={t('configSections.shape.shape')}
        value={view}
        onChange={(v) => set({ view: v as ShapeView })}
        options={VIEW_OPTIONS}
      />

      <ShapeFillControls config={c} set={set} view={view} />

      {/* ---- Line views ---- */}
      <ShapeLineControls config={c} set={set} view={view} />

      {/* ---- Geometric shapes ---- */}
      <ShapeGeometryControls config={c} set={set} view={view} />

      {/* ---- Atmospheric ---- */}
      <ShapeAtmosphericControls config={c} set={set} view={view} />

      {/* ---- Frame ---- */}
      <ShapeFrameControls config={c} set={set} view={view} />
    </>
  );
}
