'use client';

import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import SectionHeading from '@/components/ui/SectionHeading';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import { TextContentFields } from './TextContentFields';
import { TextTypographyControls } from './TextTypographyControls';
import { TextFeatureControls } from './TextFeatureControls';
import { TextEffectControls } from './TextEffectControls';
import { TextGradientControls } from './TextGradientControls';
import { TextLayoutControls } from './TextLayoutControls';
import { TextRotationControls } from './TextRotationControls';
import { TextMarqueeControls } from './TextMarqueeControls';
import type { ModuleInstance, TextConfig } from '@/types/config';

export function TextConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<TextConfig>(mod, screenId);
  const t = useTranslate('editor');

  const ORIENTATION_OPTIONS: { value: 'horizontal' | 'vertical' | 'sideways'; label: string }[] = [
    { value: 'horizontal', label: t('configSections.text.orientationOptions.horizontal') },
    { value: 'vertical', label: t('configSections.text.orientationOptions.vertical') },
    { value: 'sideways', label: t('configSections.text.orientationOptions.sideways') },
  ];

  const ALIGNMENT_OPTIONS = [
    { value: 'left', label: t('configSections.text.alignmentOptions.left') },
    { value: 'center', label: t('configSections.text.alignmentOptions.center') },
    { value: 'right', label: t('configSections.text.alignmentOptions.right') },
  ] as const;

  const VERTICAL_ALIGN_OPTIONS: { value: 'top' | 'center' | 'bottom'; label: string }[] = [
    { value: 'top', label: t('configSections.text.verticalAlignOptions.top') },
    { value: 'center', label: t('configSections.text.verticalAlignOptions.center') },
    { value: 'bottom', label: t('configSections.text.verticalAlignOptions.bottom') },
  ];

  return (
    <div className="space-y-2">
      {/* ── Content ── */}
      <TextContentFields config={c} set={set} />

      {/* ── Layout ── */}
      <LabeledSelect
        label={t('configSections.text.orientation')}
        value={(c.orientation as 'horizontal' | 'vertical' | 'sideways') || 'horizontal'}
        onChange={(v) => set({ orientation: v })}
        options={ORIENTATION_OPTIONS}
      />

      <LabeledSelect
        label={t('configSections.text.alignment')}
        value={(c.alignment as 'left' | 'center' | 'right') || 'center'}
        onChange={(v) => set({ alignment: v })}
        options={ALIGNMENT_OPTIONS}
      />

      <LabeledSelect
        label={t('configSections.text.verticalAlign')}
        value={(c.verticalAlign as 'top' | 'center' | 'bottom') || 'center'}
        onChange={(v) => set({ verticalAlign: v })}
        options={VERTICAL_ALIGN_OPTIONS}
      />

      {/* ── Typography ── */}
      <TextTypographyControls config={c} set={set} />

      {/* ── Features ── */}
      <TextFeatureControls config={c} set={set} />

      {/* ── Effect ── */}
      <TextEffectControls config={c} set={set} />

      {/* ── Gradient ── */}
      <TextGradientControls config={c} set={set} />

      {/* ── Layout polish ── */}
      <TextLayoutControls config={c} set={set} />

      {/* ── Rotation ── */}
      <TextRotationControls config={c} set={set} />

      {/* ── Marquee ── */}
      <TextMarqueeControls config={c} set={set} />

      {/* ── Decorative ── */}
      <SectionHeading>{t('configSections.text.sections.decorative')}</SectionHeading>

      <Toggle label={t('configSections.text.dividers')} checked={!!c.showDividers} onChange={(v) => set({ showDividers: v })} />

      <ColorPicker
        label={t('configSections.text.accentColor')}
        value={(c.accentColor as string) || '#ffffff'}
        onChange={(v) => set({ accentColor: v })}
      />
    </div>
  );
}
