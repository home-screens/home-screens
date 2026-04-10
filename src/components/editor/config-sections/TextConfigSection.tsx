'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import SectionHeading from '@/components/ui/SectionHeading';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance, TextConfig } from '@/types/config';

export function TextConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<TextConfig>(mod, screenId);

  const effect = (c.effect as string) || 'none';
  const gradientOn = !!c.gradientEnabled;
  const rotationOn = !!c.rotationEnabled;
  const marqueeOn = !!c.marquee;

  return (
    <div className="space-y-2">
      {/* ── Content ── */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Content</span>
        <textarea
          value={(c.content as string) || ''}
          onChange={(e) => set({ content: e.target.value })}
          rows={4}
          className={`${INPUT_CLASS} resize-none`}
          placeholder={rotationOn ? 'Slide 1\n---\nSlide 2\n---\nSlide 3' : 'Hello, World!'}
        />
      </label>

      {/* ── Layout ── */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Orientation</span>
        <select
          value={(c.orientation as string) || 'horizontal'}
          onChange={(e) => set({ orientation: e.target.value })}
          className={INPUT_CLASS}
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
          <option value="sideways">Sideways</option>
        </select>
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Alignment</span>
        <select
          value={(c.alignment as string) || 'center'}
          onChange={(e) => set({ alignment: e.target.value })}
          className={INPUT_CLASS}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Vertical Align</span>
        <select
          value={(c.verticalAlign as string) || 'center'}
          onChange={(e) => set({ verticalAlign: e.target.value })}
          className={INPUT_CLASS}
        >
          <option value="top">Top</option>
          <option value="center">Center</option>
          <option value="bottom">Bottom</option>
        </select>
      </label>

      {/* ── Typography ── */}
      <SectionHeading>Typography</SectionHeading>

      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Text Transform</span>
        <select
          value={(c.textTransform as string) || 'none'}
          onChange={(e) => set({ textTransform: e.target.value })}
          className={INPUT_CLASS}
        >
          <option value="none">None</option>
          <option value="uppercase">UPPERCASE</option>
          <option value="lowercase">lowercase</option>
          <option value="capitalize">Capitalize</option>
        </select>
      </label>

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

      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Effect</span>
        <select
          value={effect}
          onChange={(e) => set({ effect: e.target.value })}
          className={INPUT_CLASS}
        >
          <option value="none">None</option>
          <option value="typewriter">Typewriter</option>
          <option value="fade-in">Fade In</option>
          <option value="gradient-sweep">Gradient Sweep</option>
          <option value="glow">Glow / Pulse</option>
        </select>
      </label>

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
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-hs-text-muted">Separator</span>
            <input
              type="text"
              value={(c.rotationSeparator as string) || '---'}
              onChange={(e) => set({ rotationSeparator: e.target.value })}
              className={INPUT_CLASS}
            />
          </label>
        </>
      )}

      {/* ── Marquee ── */}
      <SectionHeading>Marquee</SectionHeading>

      <Toggle label="Scrolling Marquee" checked={marqueeOn} onChange={(v) => set({ marquee: v })} />

      {marqueeOn && (
        <>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-hs-text-muted">Direction</span>
            <select
              value={(c.marqueeDirection as string) || 'left'}
              onChange={(e) => set({ marqueeDirection: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
            </select>
          </label>
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
