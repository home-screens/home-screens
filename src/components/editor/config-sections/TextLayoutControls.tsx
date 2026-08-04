'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import SectionHeading from '@/components/ui/SectionHeading';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useTranslate } from '@/i18n';
import type { ConfigControlsProps } from './config-controls';
import type { TextConfig, TextWrapMode } from '@/types/config';

export function TextLayoutControls({ config: c, set }: ConfigControlsProps<TextConfig>) {
  const t = useTranslate('editor');

  const WRAP_OPTIONS: { value: TextWrapMode; label: string }[] = [
    { value: 'normal', label: t('configSections.text.wrapOptions.normal') },
    { value: 'nowrap', label: t('configSections.text.wrapOptions.nowrap') },
    { value: 'balance', label: t('configSections.text.wrapOptions.balance') },
    { value: 'pretty', label: t('configSections.text.wrapOptions.pretty') },
  ];

  return (
    <>
      <SectionHeading>{t('configSections.text.sections.layout')}</SectionHeading>

      <Slider
        label={t('configSections.text.maxWidth')}
        value={c.maxWidth ?? 0}
        min={0}
        max={2000}
        step={10}
        displayValue={c.maxWidth ? `${c.maxWidth}px` : t('configSections.text.maxWidthNoLimit')}
        onChange={(v) => set({ maxWidth: v })}
      />

      <LabeledSelect
        label={t('configSections.text.wrap')}
        value={(c.wrapMode as TextWrapMode) || 'normal'}
        onChange={(v) => set({ wrapMode: v })}
        options={WRAP_OPTIONS}
      />

      <Toggle label={t('configSections.text.dropCap')} checked={!!c.dropCap} onChange={(v) => set({ dropCap: v })} />
      {c.dropCap && (
        <ColorPicker
          label={t('configSections.text.dropCapColor')}
          value={(c.dropCapColor as string) || (c.accentColor as string) || '#ffffff'}
          onChange={(v) => set({ dropCapColor: v })}
        />
      )}

      <ColorPicker
        label={t('configSections.text.textBackground')}
        value={(c.textBackground as string) || 'transparent'}
        onChange={(v) => set({ textBackground: v && v !== 'transparent' ? v : undefined })}
      />
      {c.textBackground && (
        <>
          <Slider
            label={t('configSections.text.bgPadding')}
            value={c.textBackgroundPadding ?? 4}
            min={0}
            max={32}
            displayValue={`${c.textBackgroundPadding ?? 4}px`}
            onChange={(v) => set({ textBackgroundPadding: v })}
          />
          <Slider
            label={t('configSections.text.bgRadius')}
            value={c.textBackgroundRadius ?? 4}
            min={0}
            max={32}
            displayValue={`${c.textBackgroundRadius ?? 4}px`}
            onChange={(v) => set({ textBackgroundRadius: v })}
          />
        </>
      )}
    </>
  );
}
