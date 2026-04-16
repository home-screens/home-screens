'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import SectionHeading from '@/components/ui/SectionHeading';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import LabeledTextarea from '@/components/ui/LabeledTextarea';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance, TextConfig } from '@/types/config';

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

const EFFECT_OPTIONS: { value: 'none' | 'typewriter' | 'fade-in' | 'gradient-sweep' | 'glow'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'typewriter', label: 'Typewriter' },
  { value: 'fade-in', label: 'Fade In' },
  { value: 'gradient-sweep', label: 'Gradient Sweep' },
  { value: 'glow', label: 'Glow / Pulse' },
];

const MARQUEE_DIRECTION_OPTIONS: { value: 'left' | 'right' | 'up' | 'down'; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
];

export function TextConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<TextConfig>(mod, screenId);

  const effect = (c.effect as string) || 'none';
  const gradientOn = !!c.gradientEnabled;
  const rotationOn = !!c.rotationEnabled;
  const marqueeOn = !!c.marquee;

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

      <LabeledSelect
        label="Text Transform"
        value={(c.textTransform as 'none' | 'uppercase' | 'lowercase' | 'capitalize') || 'none'}
        onChange={(v) => set({ textTransform: v })}
        options={TEXT_TRANSFORM_OPTIONS}
      />

      <Slider
        label="Letter Spacing"
        value={c.letterSpacing ?? 0}
        min={0}
        max={20}
        displayValue={`${c.letterSpacing ?? 0}px`}
        onChange={(v) => set({ letterSpacing: v })}
      />

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
        value={effect as 'none' | 'typewriter' | 'fade-in' | 'gradient-sweep' | 'glow'}
        onChange={(v) => set({ effect: v })}
        options={EFFECT_OPTIONS}
      />

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
