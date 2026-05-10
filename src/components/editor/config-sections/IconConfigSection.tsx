'use client';

import { useState } from 'react';
import ColorPicker from '@/components/ui/ColorPicker';
import IconPicker from '@/components/ui/IconPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { getFaIconKind, getFaIconStyles, pickStyleForIcon, type FaIconKind } from '@/lib/font-awesome-icons';
import { useTranslate } from '@/i18n';
import type { IconConfig, ModuleInstance } from '@/types/config';

export function IconConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<IconConfig>(mod, screenId);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const ALL_STYLE_OPTIONS = [
    { value: 'solid', label: t('configSections.icon.styleSolid') },
    { value: 'regular', label: t('configSections.icon.styleRegular') },
    { value: 'brands', label: t('configSections.icon.styleBrands') },
  ] as const;

  const ROTATION_OPTIONS = [
    { value: '0', label: t('configSections.icon.rotation0') },
    { value: '90', label: t('configSections.icon.rotation90') },
    { value: '180', label: t('configSections.icon.rotation180') },
    { value: '270', label: t('configSections.icon.rotation270') },
  ] as const;

  const FLIP_OPTIONS = [
    { value: 'none', label: t('configSections.icon.flipNone') },
    { value: 'horizontal', label: t('configSections.icon.flipHorizontal') },
    { value: 'vertical', label: t('configSections.icon.flipVertical') },
    { value: 'both', label: t('configSections.icon.flipBoth') },
  ] as const;

  const ANIMATION_OPTIONS = [
    { value: 'none', label: t('configSections.icon.animationNone') },
    { value: 'spin', label: t('configSections.icon.animationSpin') },
    { value: 'spin-pulse', label: t('configSections.icon.animationSpinPulse') },
    { value: 'spin-reverse', label: t('configSections.icon.animationSpinReverse') },
    { value: 'beat', label: t('configSections.icon.animationBeat') },
    { value: 'fade', label: t('configSections.icon.animationFade') },
    { value: 'beat-fade', label: t('configSections.icon.animationBeatFade') },
    { value: 'bounce', label: t('configSections.icon.animationBounce') },
    { value: 'shake', label: t('configSections.icon.animationShake') },
    { value: 'flip', label: t('configSections.icon.animationFlip') },
  ] as const;

  const animation = c.animation ?? 'none';
  const showAnimationDuration = animation !== 'none';
  const currentStyle = c.style ?? 'solid';

  // Restrict the Style dropdown to options the currently-selected icon
  // actually ships in. Picking `house` (solid+regular) and then flipping
  // style to "Brands" would otherwise render `fa-brands fa-house` against
  // a woff2 with no glyph for that codepoint — Codex caught this gap.
  // No icon selected yet → fall back to the full set so the dropdown is
  // never empty.
  const supportedStyles = c.iconName ? getFaIconStyles(c.iconName) : undefined;
  const styleOptions = supportedStyles
    ? ALL_STYLE_OPTIONS.filter((o) => supportedStyles.includes(o.value as FaIconKind))
    : ALL_STYLE_OPTIONS;

  return (
    <>
      <IconPicker
        label={t('configSections.icon.icon')}
        value={c.iconName ?? ''}
        currentKind={currentStyle}
        onPick={(name, kind, styles) => {
          // Keep the user's current style only if the picked icon actually
          // supports it (some icons ship in both solid + regular). Otherwise
          // snap to the icon's primary kind so the rendered class matches a
          // woff2 that has the glyph — without this we'd render
          // `fa-regular fa-X` against a regular woff2 that doesn't carry X,
          // and the codepoint shows as fallback text.
          set({ iconName: name, style: pickStyleForIcon(currentStyle, styles, kind) });
        }}
      />

      <LabeledSelect
        label={t('configSections.icon.style')}
        value={currentStyle}
        onChange={(v) => {
          const next = v as IconConfig['style'];
          // The dropdown options are already filtered to supported styles,
          // but a stale persisted config (e.g. icon was later renamed in an
          // FA upgrade) could still flow through. Snap to the icon's primary
          // kind if `next` isn't in the supported set.
          const primary = c.iconName ? getFaIconKind(c.iconName) ?? next : next;
          set({ style: pickStyleForIcon(next, supportedStyles ?? [next], primary) });
        }}
        options={styleOptions}
      />

      <ColorPicker
        label={t('configSections.icon.iconColor')}
        value={c.color ?? '#fbbf24'}
        onChange={(v) => set({ color: v })}
      />

      <ColorPicker
        label={t('configSections.icon.iconBackground')}
        value={c.iconBackground ?? 'transparent'}
        onChange={(v) => set({ iconBackground: v })}
      />

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={c.autoFit ?? true}
          onChange={(e) => set({ autoFit: e.target.checked })}
          className="accent-cyan-500"
        />
        <span className="text-xs text-hs-text-muted">{t('configSections.icon.autoFit')}</span>
      </label>

      {!c.autoFit && (
        <Slider
          label={t('configSections.icon.scale')}
          value={c.scale ?? 0.7}
          min={0.1}
          max={1}
          step={0.05}
          displayValue={`${Math.round((c.scale ?? 0.7) * 100)}%`}
          onChange={(v) => set({ scale: v })}
        />
      )}

      <LabeledSelect
        label={t('configSections.icon.rotation')}
        value={String(c.rotation ?? 0) as '0' | '90' | '180' | '270'}
        onChange={(v) => set({ rotation: Number(v) as IconConfig['rotation'] })}
        options={ROTATION_OPTIONS}
      />

      <LabeledSelect
        label={t('configSections.icon.flip')}
        value={c.flip ?? 'none'}
        onChange={(v) => set({ flip: v as IconConfig['flip'] })}
        options={FLIP_OPTIONS}
      />

      <LabeledSelect
        label={t('configSections.icon.animation')}
        value={animation}
        onChange={(v) => set({ animation: v as IconConfig['animation'] })}
        options={ANIMATION_OPTIONS}
      />

      {showAnimationDuration && (
        <Slider
          label={t('configSections.icon.animationSpeed')}
          value={c.animationDuration ?? 2}
          min={0.25}
          max={6}
          step={0.25}
          displayValue={`${(c.animationDuration ?? 2).toFixed(2)}s`}
          onChange={(v) => set({ animationDuration: v })}
        />
      )}

      <button
        type="button"
        onClick={() => setShowAdvanced((s) => !s)}
        className="text-[11px] text-hs-text-faint hover:text-hs-text-muted transition-colors text-left"
      >
        {showAdvanced ? t('configSections.icon.hideAdvanced') : t('configSections.icon.showAdvanced')}
      </button>
      {showAdvanced && (
        <LabeledInput
          label={t('configSections.icon.customClass')}
          value={c.iconName ?? ''}
          onChange={(v) => set({ iconName: v })}
          placeholder="fa-solid fa-cloud-sun"
        />
      )}
    </>
  );
}
