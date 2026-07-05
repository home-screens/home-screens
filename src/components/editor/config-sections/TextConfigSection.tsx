'use client';

import { useMemo } from 'react';
import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import SectionHeading from '@/components/ui/SectionHeading';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import LabeledTextarea from '@/components/ui/LabeledTextarea';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import FontFamilyPicker from '@/components/ui/FontFamilyPicker';
import { useTranslate } from '@/i18n';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { collectProvidedStateKeys } from '@/lib/provided-state-keys';
import { extractSharedStateKeys } from '@/lib/shared-state-template';
import type {
  ModuleInstance,
  TextConfig,
  TextEffect,
  TextDecoration,
  TextRevealOnRotation,
  TextWrapMode,
} from '@/types/config';

export function TextConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<TextConfig>(mod, screenId);
  const t = useTranslate('editor');

  // Shared-state token support ({plugin:ha:sensor.temp} in the content).
  // Same known-keys source as the visibility-condition picker so the two
  // features never disagree about which keys exist on this display.
  const editorConfig = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const providedKeys = useMemo(
    () => collectProvidedStateKeys(editorConfig ? getActiveScreens(editorConfig, selectedDisplayId) : []),
    [editorConfig, selectedDisplayId],
  );
  const content = (c.content as string) || '';
  const referencedKeys = useMemo(() => extractSharedStateKeys(content), [content]);
  const unknownKeys = useMemo(() => {
    const known = new Set(providedKeys.map((k) => k.key));
    return referencedKeys.filter((k) => !known.has(k));
  }, [providedKeys, referencedKeys]);

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

  const TEXT_TRANSFORM_OPTIONS: { value: 'none' | 'uppercase' | 'lowercase' | 'capitalize'; label: string }[] = [
    { value: 'none', label: t('configSections.text.textTransformOptions.none') },
    { value: 'uppercase', label: t('configSections.text.textTransformOptions.uppercase') },
    { value: 'lowercase', label: t('configSections.text.textTransformOptions.lowercase') },
    { value: 'capitalize', label: t('configSections.text.textTransformOptions.capitalize') },
  ];

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

  const DECORATION_OPTIONS: { value: TextDecoration; label: string }[] = [
    { value: 'none', label: t('configSections.text.decorationOptions.none') },
    { value: 'underline', label: t('configSections.text.decorationOptions.underline') },
    { value: 'overline', label: t('configSections.text.decorationOptions.overline') },
    { value: 'line-through', label: t('configSections.text.decorationOptions.line-through') },
  ];

  const REVEAL_OPTIONS: { value: TextRevealOnRotation; label: string }[] = [
    { value: 'none', label: t('configSections.text.revealOptions.none') },
    { value: 'fade', label: t('configSections.text.revealOptions.fade') },
    { value: 'slide-up', label: t('configSections.text.revealOptions.slide-up') },
    { value: 'slide-down', label: t('configSections.text.revealOptions.slide-down') },
    { value: 'zoom', label: t('configSections.text.revealOptions.zoom') },
  ];

  const WRAP_OPTIONS: { value: TextWrapMode; label: string }[] = [
    { value: 'normal', label: t('configSections.text.wrapOptions.normal') },
    { value: 'nowrap', label: t('configSections.text.wrapOptions.nowrap') },
    { value: 'balance', label: t('configSections.text.wrapOptions.balance') },
    { value: 'pretty', label: t('configSections.text.wrapOptions.pretty') },
  ];

  const MARQUEE_DIRECTION_OPTIONS: { value: 'left' | 'right' | 'up' | 'down'; label: string }[] = [
    { value: 'left', label: t('configSections.text.marqueeDirectionOptions.left') },
    { value: 'right', label: t('configSections.text.marqueeDirectionOptions.right') },
    { value: 'up', label: t('configSections.text.marqueeDirectionOptions.up') },
    { value: 'down', label: t('configSections.text.marqueeDirectionOptions.down') },
  ];

  const effect = (c.effect as TextEffect) || 'none';
  const gradientOn = !!c.gradientEnabled;
  const rotationOn = !!c.rotationEnabled;
  const marqueeOn = !!c.marquee;
  const decoration = (c.textDecoration as TextDecoration) || 'none';

  return (
    <div className="space-y-2">
      {/* ── Content ── */}
      <LabeledTextarea
        label={t('configSections.text.content')}
        value={(c.content as string) || ''}
        onChange={(v) => set({ content: v })}
        rows={4}
        placeholder={rotationOn ? t('configSections.text.contentRotationPlaceholder') : t('configSections.text.contentPlaceholder')}
      />

      {/* Live-value token helper: only shown when this display has state
          producers (or the content already references tokens), so the
          default Text UI stays uncluttered. */}
      {(providedKeys.length > 0 || referencedKeys.length > 0) && (
        <div className="space-y-1">
          <p className="text-[10px] text-hs-text-dim">
            {t('configSections.text.stateTokensHint', { example: `{${providedKeys[0]?.key ?? 'plugin:id:key'}}` })}
          </p>
          {providedKeys.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {providedKeys.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  title={k.label}
                  onClick={() => set({ content: `${content}{${k.key}}` })}
                  className="rounded bg-hs-hover px-1 py-0.5 font-mono text-[10px] text-hs-text-muted hover:text-hs-accent"
                >
                  {`{${k.key}}`}
                </button>
              ))}
            </div>
          )}
          {unknownKeys.length > 0 && (
            <p className="text-[10px] text-hs-warning">
              {t('configSections.text.stateTokenUnknown', { keys: unknownKeys.join(', ') })}
            </p>
          )}
        </div>
      )}

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
      <SectionHeading>{t('configSections.text.sections.typography')}</SectionHeading>

      <FontFamilyPicker
        label={t('configSections.text.fontOverride')}
        value={c.fontFamily as string | undefined}
        onChange={(v) => set({ fontFamily: v || undefined })}
        allowInherit
      />

      <Slider
        label={t('configSections.text.fontWeight')}
        value={c.fontWeight ?? 400}
        min={100}
        max={900}
        step={100}
        displayValue={`${c.fontWeight ?? 400}`}
        onChange={(v) => set({ fontWeight: v })}
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

      {/* ── Features ── */}
      <SectionHeading>{t('configSections.text.sections.features')}</SectionHeading>

      <Toggle label={t('configSections.text.markdown')} checked={!!c.markdown} onChange={(v) => set({ markdown: v })} />
      {!!c.markdown && (
        <p className="text-[10px] text-hs-text-faint pl-1 leading-relaxed">
          {t('configSections.text.markdownHint')}
        </p>
      )}
      {!marqueeOn && (
        <Toggle label={t('configSections.text.autoFit')} checked={!!c.autoFit} onChange={(v) => set({ autoFit: v })} />
      )}
      <Toggle
        label={t('configSections.text.templateVariables')}
        checked={!!c.templateVariables}
        onChange={(v) => set({ templateVariables: v })}
      />
      {!!c.templateVariables && (
        <p className="text-[10px] text-hs-text-faint pl-1">
          {'{{time}} {{time12}} {{date}} {{day}} {{month}} {{year}} {{greeting}}'}
        </p>
      )}

      {/* ── Effect ── */}
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

      {/* ── Gradient ── */}
      <SectionHeading>{t('configSections.text.sections.gradient')}</SectionHeading>

      <Toggle label={t('configSections.text.gradientText')} checked={gradientOn} onChange={(v) => set({ gradientEnabled: v })} />

      {gradientOn && (
        <>
          <ColorPicker
            label={t('configSections.text.gradientFrom')}
            value={(c.gradientFrom as string) || '#a78bfa'}
            onChange={(v) => set({ gradientFrom: v })}
          />
          <ColorPicker
            label={t('configSections.text.gradientTo')}
            value={(c.gradientTo as string) || '#22d3ee'}
            onChange={(v) => set({ gradientTo: v })}
          />
          <Slider
            label={t('configSections.text.gradientAngle')}
            value={c.gradientAngle ?? 90}
            min={0}
            max={360}
            step={15}
            displayValue={`${c.gradientAngle ?? 90}°`}
            onChange={(v) => set({ gradientAngle: v })}
          />
        </>
      )}

      {/* ── Layout polish ── */}
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

      {/* ── Rotation ── */}
      <SectionHeading>{t('fields.rotation')}</SectionHeading>

      <Toggle label={t('configSections.text.slideshow')} checked={rotationOn} onChange={(v) => set({ rotationEnabled: v })} />
      {rotationOn && (
        <>
          <p className="text-[10px] text-hs-text-faint pl-1 leading-relaxed">
            {t('configSections.text.slidesHintPrefix')} <span className="font-mono text-hs-text-muted">---</span> {t('configSections.text.slidesHintSuffix')}
          </p>
          <Slider
            label={t('configSections.text.interval')}
            value={c.rotationIntervalMs ?? 5000}
            min={1000}
            max={30000}
            step={500}
            displayValue={`${((c.rotationIntervalMs ?? 5000) / 1000).toFixed(1)}s`}
            onChange={(v) => set({ rotationIntervalMs: v })}
          />
          <LabeledInput
            label={t('configSections.text.separator')}
            value={(c.rotationSeparator as string) || '---'}
            onChange={(v) => set({ rotationSeparator: v })}
          />
          <LabeledSelect
            label={t('configSections.text.revealAnimation')}
            value={(c.revealOnRotation as TextRevealOnRotation) || 'none'}
            onChange={(v) => set({ revealOnRotation: v })}
            options={REVEAL_OPTIONS}
          />
        </>
      )}

      {/* ── Marquee ── */}
      <SectionHeading>{t('configSections.text.sections.marquee')}</SectionHeading>

      <Toggle label={t('configSections.text.scrollingMarquee')} checked={marqueeOn} onChange={(v) => set({ marquee: v })} />

      {marqueeOn && (
        <>
          <LabeledSelect
            label={t('configSections.text.direction')}
            value={(c.marqueeDirection as 'left' | 'right' | 'up' | 'down') || 'left'}
            onChange={(v) => set({ marqueeDirection: v })}
            options={MARQUEE_DIRECTION_OPTIONS}
          />
          <Slider
            label={t('configSections.text.speed')}
            value={c.marqueeSpeed ?? 30}
            min={5}
            max={120}
            step={5}
            displayValue={`${c.marqueeSpeed ?? 30}s`}
            onChange={(v) => set({ marqueeSpeed: v })}
          />
        </>
      )}

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
