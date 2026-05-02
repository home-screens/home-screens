'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import SectionHeading from '@/components/ui/SectionHeading';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import LabeledTextarea from '@/components/ui/LabeledTextarea';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import FontFamilyPicker from '@/components/ui/FontFamilyPicker';
import type {
  ModuleInstance,
  TextConfig,
  TextEffect,
  TextDecoration,
  TextRevealOnRotation,
  TextWrapMode,
} from '@/types/config';

const ORIENTATION_OPTIONS: { value: 'horizontal' | 'vertical' | 'sideways'; label: string }[] = [
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'sideways', label: 'Sideways' },
];

const ALIGNMENT_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
] as const;

const VERTICAL_ALIGN_OPTIONS: { value: 'top' | 'center' | 'bottom'; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'center', label: 'Center' },
  { value: 'bottom', label: 'Bottom' },
];

const TEXT_TRANSFORM_OPTIONS: { value: 'none' | 'uppercase' | 'lowercase' | 'capitalize'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'uppercase', label: 'UPPERCASE' },
  { value: 'lowercase', label: 'lowercase' },
  { value: 'capitalize', label: 'Capitalize' },
];

const EFFECT_OPTIONS: { value: TextEffect; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'typewriter', label: 'Typewriter' },
  { value: 'fade-in', label: 'Fade In' },
  { value: 'gradient-sweep', label: 'Gradient Sweep' },
  { value: 'glow', label: 'Glow / Pulse' },
  { value: 'outline', label: 'Outline' },
  { value: 'shadow', label: 'Drop Shadow' },
  { value: '3d', label: '3D / Extruded' },
  { value: 'neon', label: 'Neon' },
  { value: 'wave', label: 'Wave (per-character)' },
  { value: 'bounce', label: 'Bounce (per-character)' },
  { value: 'shake', label: 'Shake (per-character)' },
  { value: 'color-cycle', label: 'Color Cycle' },
];

const DECORATION_OPTIONS: { value: TextDecoration; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'underline', label: 'Underline' },
  { value: 'overline', label: 'Overline' },
  { value: 'line-through', label: 'Strikethrough' },
];

const REVEAL_OPTIONS: { value: TextRevealOnRotation; label: string }[] = [
  { value: 'none', label: 'None (instant swap)' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide-up', label: 'Slide up' },
  { value: 'slide-down', label: 'Slide down' },
  { value: 'zoom', label: 'Zoom' },
];

const WRAP_OPTIONS: { value: TextWrapMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'nowrap', label: 'No wrap (single line)' },
  { value: 'balance', label: 'Balanced (multi-line)' },
  { value: 'pretty', label: 'Pretty (avoid orphans)' },
];

const MARQUEE_DIRECTION_OPTIONS: { value: 'left' | 'right' | 'up' | 'down'; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
];

export function TextConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<TextConfig>(mod, screenId);

  const effect = (c.effect as TextEffect) || 'none';
  const gradientOn = !!c.gradientEnabled;
  const rotationOn = !!c.rotationEnabled;
  const marqueeOn = !!c.marquee;
  const decoration = (c.textDecoration as TextDecoration) || 'none';

  return (
    <div className="space-y-2">
      {/* ── Content ── */}
      <LabeledTextarea
        label="Content"
        value={(c.content as string) || ''}
        onChange={(v) => set({ content: v })}
        rows={4}
        placeholder={rotationOn ? 'Slide 1\n---\nSlide 2\n---\nSlide 3' : 'Hello, World!'}
      />

      {/* ── Layout ── */}
      <LabeledSelect
        label="Orientation"
        value={(c.orientation as 'horizontal' | 'vertical' | 'sideways') || 'horizontal'}
        onChange={(v) => set({ orientation: v })}
        options={ORIENTATION_OPTIONS}
      />

      <LabeledSelect
        label="Alignment"
        value={(c.alignment as 'left' | 'center' | 'right') || 'center'}
        onChange={(v) => set({ alignment: v })}
        options={ALIGNMENT_OPTIONS}
      />

      <LabeledSelect
        label="Vertical Align"
        value={(c.verticalAlign as 'top' | 'center' | 'bottom') || 'center'}
        onChange={(v) => set({ verticalAlign: v })}
        options={VERTICAL_ALIGN_OPTIONS}
      />

      {/* ── Typography ── */}
      <SectionHeading>Typography</SectionHeading>

      <FontFamilyPicker
        label="Font (override)"
        value={c.fontFamily as string | undefined}
        onChange={(v) => set({ fontFamily: v || undefined })}
        allowInherit
      />

      <Slider
        label="Font Weight"
        value={c.fontWeight ?? 400}
        min={100}
        max={900}
        step={100}
        displayValue={`${c.fontWeight ?? 400}`}
        onChange={(v) => set({ fontWeight: v })}
      />

      <Toggle label="Italic" checked={!!c.italic} onChange={(v) => set({ italic: v })} />

      <Slider
        label="Line Height"
        value={c.lineHeight ?? 1.2}
        min={0.8}
        max={3}
        step={0.05}
        displayValue={`${(c.lineHeight ?? 1.2).toFixed(2)}`}
        onChange={(v) => set({ lineHeight: v })}
      />

      <LabeledSelect
        label="Text Transform"
        value={(c.textTransform as 'none' | 'uppercase' | 'lowercase' | 'capitalize') || 'none'}
        onChange={(v) => set({ textTransform: v })}
        options={TEXT_TRANSFORM_OPTIONS}
      />

      <Slider
        label="Letter Spacing"
        value={c.letterSpacing ?? 0}
        min={-5}
        max={20}
        displayValue={`${c.letterSpacing ?? 0}px`}
        onChange={(v) => set({ letterSpacing: v })}
      />

      <Slider
        label="Word Spacing"
        value={c.wordSpacing ?? 0}
        min={-10}
        max={40}
        displayValue={`${c.wordSpacing ?? 0}px`}
        onChange={(v) => set({ wordSpacing: v })}
      />

      <LabeledSelect
        label="Decoration"
        value={decoration}
        onChange={(v) => set({ textDecoration: v })}
        options={DECORATION_OPTIONS}
      />

      {decoration !== 'none' && (
        <>
          <ColorPicker
            label="Decoration Color"
            value={(c.textDecorationColor as string) || '#ffffff'}
            onChange={(v) => set({ textDecorationColor: v })}
          />
          <Slider
            label="Decoration Thickness"
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
          <span className="text-xs text-hs-text-muted">Emoji</span>
          {c.icon && (
            <button
              type="button"
              onClick={() => set({ icon: '' })}
              className="text-[10px] text-hs-text-faint hover:text-hs-text-secondary"
            >
              Clear
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
        <span className="text-[10px] text-hs-text-faint">Shown before the text</span>
      </div>

      {/* ── Features ── */}
      <SectionHeading>Features</SectionHeading>

      <Toggle label="Markdown" checked={!!c.markdown} onChange={(v) => set({ markdown: v })} />
      {!!c.markdown && (
        <p className="text-[10px] text-hs-text-faint pl-1 leading-relaxed">
          **bold** &nbsp; *italic* &nbsp; ~~strike~~ &nbsp; `code` &nbsp; newlines → line breaks
        </p>
      )}
      {!marqueeOn && (
        <Toggle label="Auto-fit to Container" checked={!!c.autoFit} onChange={(v) => set({ autoFit: v })} />
      )}
      <Toggle
        label="Template Variables"
        checked={!!c.templateVariables}
        onChange={(v) => set({ templateVariables: v })}
      />
      {!!c.templateVariables && (
        <p className="text-[10px] text-hs-text-faint pl-1">
          {'{{time}} {{time12}} {{date}} {{day}} {{month}} {{year}} {{greeting}}'}
        </p>
      )}

      {/* ── Effect ── */}
      <SectionHeading>Effect</SectionHeading>

      <LabeledSelect
        label="Effect"
        value={effect}
        onChange={(v) => set({ effect: v })}
        options={EFFECT_OPTIONS}
      />

      {(effect === 'wave' || effect === 'bounce' || effect === 'shake' ||
        effect === 'glow' || effect === 'neon' || effect === 'gradient-sweep' ||
        effect === 'color-cycle') && (
        <Slider
          label="Animation Speed"
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
            label="Outline Width"
            value={c.outlineWidth ?? 2}
            min={1}
            max={10}
            displayValue={`${c.outlineWidth ?? 2}px`}
            onChange={(v) => set({ outlineWidth: v })}
          />
          <ColorPicker
            label="Outline Color"
            value={(c.outlineColor as string) || '#000000'}
            onChange={(v) => set({ outlineColor: v })}
          />
        </>
      )}

      {effect === 'shadow' && (
        <>
          <Slider
            label="Shadow X"
            value={c.shadowOffsetX ?? 2}
            min={-20}
            max={20}
            displayValue={`${c.shadowOffsetX ?? 2}px`}
            onChange={(v) => set({ shadowOffsetX: v })}
          />
          <Slider
            label="Shadow Y"
            value={c.shadowOffsetY ?? 2}
            min={-20}
            max={20}
            displayValue={`${c.shadowOffsetY ?? 2}px`}
            onChange={(v) => set({ shadowOffsetY: v })}
          />
          <Slider
            label="Shadow Blur"
            value={c.shadowBlur ?? 4}
            min={0}
            max={40}
            displayValue={`${c.shadowBlur ?? 4}px`}
            onChange={(v) => set({ shadowBlur: v })}
          />
          <ColorPicker
            label="Shadow Color"
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
      <SectionHeading>Gradient</SectionHeading>

      <Toggle label="Gradient Text" checked={gradientOn} onChange={(v) => set({ gradientEnabled: v })} />

      {gradientOn && (
        <>
          <ColorPicker
            label="From"
            value={(c.gradientFrom as string) || '#a78bfa'}
            onChange={(v) => set({ gradientFrom: v })}
          />
          <ColorPicker
            label="To"
            value={(c.gradientTo as string) || '#22d3ee'}
            onChange={(v) => set({ gradientTo: v })}
          />
          <Slider
            label="Angle"
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
      <SectionHeading>Layout</SectionHeading>

      <Slider
        label="Max Width"
        value={c.maxWidth ?? 0}
        min={0}
        max={2000}
        step={10}
        displayValue={c.maxWidth ? `${c.maxWidth}px` : 'No limit'}
        onChange={(v) => set({ maxWidth: v })}
      />

      <LabeledSelect
        label="Wrap"
        value={(c.wrapMode as TextWrapMode) || 'normal'}
        onChange={(v) => set({ wrapMode: v })}
        options={WRAP_OPTIONS}
      />

      <Toggle label="Drop Cap" checked={!!c.dropCap} onChange={(v) => set({ dropCap: v })} />
      {c.dropCap && (
        <ColorPicker
          label="Drop Cap Color"
          value={(c.dropCapColor as string) || (c.accentColor as string) || '#ffffff'}
          onChange={(v) => set({ dropCapColor: v })}
        />
      )}

      <ColorPicker
        label="Text Background"
        value={(c.textBackground as string) || 'transparent'}
        onChange={(v) => set({ textBackground: v && v !== 'transparent' ? v : undefined })}
      />
      {c.textBackground && (
        <>
          <Slider
            label="BG Padding"
            value={c.textBackgroundPadding ?? 4}
            min={0}
            max={32}
            displayValue={`${c.textBackgroundPadding ?? 4}px`}
            onChange={(v) => set({ textBackgroundPadding: v })}
          />
          <Slider
            label="BG Radius"
            value={c.textBackgroundRadius ?? 4}
            min={0}
            max={32}
            displayValue={`${c.textBackgroundRadius ?? 4}px`}
            onChange={(v) => set({ textBackgroundRadius: v })}
          />
        </>
      )}

      {/* ── Rotation ── */}
      <SectionHeading>Rotation</SectionHeading>

      <Toggle label="Slideshow" checked={rotationOn} onChange={(v) => set({ rotationEnabled: v })} />
      {rotationOn && (
        <>
          <p className="text-[10px] text-hs-text-faint pl-1 leading-relaxed">
            Separate slides with <span className="font-mono text-hs-text-muted">---</span> in the content above
          </p>
          <Slider
            label="Interval"
            value={c.rotationIntervalMs ?? 5000}
            min={1000}
            max={30000}
            step={500}
            displayValue={`${((c.rotationIntervalMs ?? 5000) / 1000).toFixed(1)}s`}
            onChange={(v) => set({ rotationIntervalMs: v })}
          />
          <LabeledInput
            label="Separator"
            value={(c.rotationSeparator as string) || '---'}
            onChange={(v) => set({ rotationSeparator: v })}
          />
          <LabeledSelect
            label="Reveal animation"
            value={(c.revealOnRotation as TextRevealOnRotation) || 'none'}
            onChange={(v) => set({ revealOnRotation: v })}
            options={REVEAL_OPTIONS}
          />
        </>
      )}

      {/* ── Marquee ── */}
      <SectionHeading>Marquee</SectionHeading>

      <Toggle label="Scrolling Marquee" checked={marqueeOn} onChange={(v) => set({ marquee: v })} />

      {marqueeOn && (
        <>
          <LabeledSelect
            label="Direction"
            value={(c.marqueeDirection as 'left' | 'right' | 'up' | 'down') || 'left'}
            onChange={(v) => set({ marqueeDirection: v })}
            options={MARQUEE_DIRECTION_OPTIONS}
          />
          <Slider
            label="Speed"
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
      <SectionHeading>Decorative</SectionHeading>

      <Toggle label="Dividers" checked={!!c.showDividers} onChange={(v) => set({ showDividers: v })} />

      <ColorPicker
        label="Accent Color"
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
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-hs-text-muted">Color Cycle Palette</span>
        <button
          type="button"
          onClick={() => onChange([...palette, '#ffffff'])}
          className="text-[10px] text-hs-text-faint hover:text-hs-text-secondary"
        >
          + Add
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
