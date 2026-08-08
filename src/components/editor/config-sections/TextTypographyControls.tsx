'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import SectionHeading from '@/components/ui/SectionHeading';
import LabeledSelect from '@/components/ui/LabeledSelect';
import FontFamilyPicker from '@/components/ui/FontFamilyPicker';
import { useTranslate } from '@/i18n';
import type { ConfigControlsProps } from './config-controls';
import type { TextConfig, TextDecoration } from '@/types/config';

export function TextTypographyControls({ config: c, set }: ConfigControlsProps<TextConfig>) {
  const t = useTranslate('editor');

  const TEXT_TRANSFORM_OPTIONS: { value: 'none' | 'uppercase' | 'lowercase' | 'capitalize'; label: string }[] = [
    { value: 'none', label: t('configSections.text.textTransformOptions.none') },
    { value: 'uppercase', label: t('configSections.text.textTransformOptions.uppercase') },
    { value: 'lowercase', label: t('configSections.text.textTransformOptions.lowercase') },
    { value: 'capitalize', label: t('configSections.text.textTransformOptions.capitalize') },
  ];

  const DECORATION_OPTIONS: { value: TextDecoration; label: string }[] = [
    { value: 'none', label: t('configSections.text.decorationOptions.none') },
    { value: 'underline', label: t('configSections.text.decorationOptions.underline') },
    { value: 'overline', label: t('configSections.text.decorationOptions.overline') },
    { value: 'line-through', label: t('configSections.text.decorationOptions.line-through') },
  ];

  const decoration = (c.textDecoration as TextDecoration) || 'none';

  return (
    <>
      <SectionHeading>{t('configSections.text.sections.typography')}</SectionHeading>

      <FontFamilyPicker
        label={t('configSections.text.fontOverride')}
        value={c.fontFamily as string | undefined}
        onChange={(v) => set({ fontFamily: v || undefined })}
        allowInherit
      />

      <Toggle label={t('configSections.text.italic')} checked={!!c.italic} onChange={(v) => set({ italic: v })} />

      <Slider
        label={t('configSections.text.lineHeight')}
        value={c.lineHeight ?? 1.2}
        min={0.8}
        max={3}
        step={0.05}
        displayValue={`${(c.lineHeight ?? 1.2).toFixed(2)}`}
        onChange={(v) => set({ lineHeight: v })}
      />

      <LabeledSelect
        label={t('configSections.text.textTransform')}
        value={(c.textTransform as 'none' | 'uppercase' | 'lowercase' | 'capitalize') || 'none'}
        onChange={(v) => set({ textTransform: v })}
        options={TEXT_TRANSFORM_OPTIONS}
      />

      <Slider
        label={t('configSections.text.letterSpacing')}
        value={c.letterSpacing ?? 0}
        min={-5}
        max={20}
        displayValue={`${c.letterSpacing ?? 0}px`}
        onChange={(v) => set({ letterSpacing: v })}
      />

      <Slider
        label={t('configSections.text.wordSpacing')}
        value={c.wordSpacing ?? 0}
        min={-10}
        max={40}
        displayValue={`${c.wordSpacing ?? 0}px`}
        onChange={(v) => set({ wordSpacing: v })}
      />

      <LabeledSelect
        label={t('configSections.text.decoration')}
        value={decoration}
        onChange={(v) => set({ textDecoration: v })}
        options={DECORATION_OPTIONS}
      />

      {decoration !== 'none' && (
        <>
          <ColorPicker
            label={t('configSections.text.decorationColor')}
            value={(c.textDecorationColor as string) || '#ffffff'}
            onChange={(v) => set({ textDecorationColor: v })}
          />
          <Slider
            label={t('configSections.text.decorationThickness')}
            value={c.textDecorationThickness ?? 2}
            min={1}
            max={10}
            displayValue={`${c.textDecorationThickness ?? 2}px`}
            onChange={(v) => set({ textDecorationThickness: v })}
          />
        </>
      )}

      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-hs-text-muted">{t('configSections.text.emoji')}</span>
          {c.icon && (
            <button
              type="button"
              onClick={() => set({ icon: '' })}
              className="text-[10px] text-hs-text-faint hover:text-hs-text-secondary"
            >
              {t('configSections.text.clear')}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {['☀️', '🌙', '🏠', '❤️', '🎵', '🔥', '⭐', '✨', '🎯', '💡', '📌', '🚀', '👋', '☕', '🌿', '🎉'].map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => set({ icon: c.icon === e ? '' : e })}
              className={`w-7 h-7 rounded text-sm flex items-center justify-center transition-colors ${
                c.icon === e ? 'bg-hs-accent/40 ring-1 ring-hs-accent' : 'bg-hs-hover hover:bg-hs-card/50'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-hs-text-faint">{t('configSections.text.emojiHint')}</span>
      </div>
    </>
  );
}
