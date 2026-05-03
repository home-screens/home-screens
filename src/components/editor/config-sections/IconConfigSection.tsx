'use client';

import { useState } from 'react';
import ColorPicker from '@/components/ui/ColorPicker';
import IconPicker from '@/components/ui/IconPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { getFaIconKind, getFaIconStyles, pickStyleForIcon, type FaIconKind } from '@/lib/font-awesome-icons';
import type { IconConfig, ModuleInstance } from '@/types/config';

const ALL_STYLE_OPTIONS = [
  { value: 'solid', label: 'Solid' },
  { value: 'regular', label: 'Regular (outline)' },
  { value: 'brands', label: 'Brands (logos)' },
] as const;

const ROTATION_OPTIONS = [
  { value: '0', label: 'No rotation' },
  { value: '90', label: '90°' },
  { value: '180', label: '180°' },
  { value: '270', label: '270°' },
] as const;

const FLIP_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'both', label: 'Both' },
] as const;

const ANIMATION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'spin', label: 'Spin' },
  { value: 'spin-pulse', label: 'Spin (stepped)' },
  { value: 'spin-reverse', label: 'Spin reverse' },
  { value: 'beat', label: 'Beat' },
  { value: 'fade', label: 'Fade' },
  { value: 'beat-fade', label: 'Beat + fade' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'shake', label: 'Shake' },
  { value: 'flip', label: 'Flip' },
] as const;

export function IconConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<IconConfig>(mod, screenId);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
        label="Icon"
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
        label="Style"
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
        label="Icon color"
        value={c.color ?? '#fbbf24'}
        onChange={(v) => set({ color: v })}
      />

      <ColorPicker
        label="Icon background"
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
        <span className="text-xs text-hs-text-muted">Auto-fit to module size</span>
      </label>

      {!c.autoFit && (
        <Slider
          label="Scale"
          value={c.scale ?? 0.7}
          min={0.1}
          max={1}
          step={0.05}
          displayValue={`${Math.round((c.scale ?? 0.7) * 100)}%`}
          onChange={(v) => set({ scale: v })}
        />
      )}

      <LabeledSelect
        label="Rotation"
        value={String(c.rotation ?? 0) as '0' | '90' | '180' | '270'}
        onChange={(v) => set({ rotation: Number(v) as IconConfig['rotation'] })}
        options={ROTATION_OPTIONS}
      />

      <LabeledSelect
        label="Flip"
        value={c.flip ?? 'none'}
        onChange={(v) => set({ flip: v as IconConfig['flip'] })}
        options={FLIP_OPTIONS}
      />

      <LabeledSelect
        label="Animation"
        value={animation}
        onChange={(v) => set({ animation: v as IconConfig['animation'] })}
        options={ANIMATION_OPTIONS}
      />

      {showAnimationDuration && (
        <Slider
          label="Animation speed"
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
        {showAdvanced ? '▾ Hide advanced' : '▸ Advanced — paste a raw class string'}
      </button>
      {showAdvanced && (
        <LabeledInput
          label="Custom class"
          value={c.iconName ?? ''}
          onChange={(v) => set({ iconName: v })}
          placeholder="fa-solid fa-cloud-sun"
        />
      )}
    </>
  );
}
