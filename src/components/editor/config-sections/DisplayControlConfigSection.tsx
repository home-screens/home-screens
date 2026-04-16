'use client';

import { useEditorStore } from '@/stores/editor-store';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import LabeledField from '@/components/ui/LabeledField';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance, DisplayControlConfig } from '@/types/config';

export function DisplayControlConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<DisplayControlConfig>(mod, screenId);
  const displays = useEditorStore((s) => s.config?.displays ?? []);

  const legacy = displays.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <span className="text-xs text-hs-text-muted uppercase tracking-wider">Layout</span>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {(['bar', 'pad', 'panel'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => set({ layout: opt })}
              className={`px-3 py-2 rounded-lg border text-sm capitalize transition-colors ${
                c.layout === opt
                  ? 'border-hs-accent bg-hs-accent-soft text-hs-accent-hover'
                  : 'border-hs-border-strong bg-hs-card text-hs-text-muted hover:text-hs-text-secondary'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <LabeledField label="Default target">
        <select
          value={c.defaultTarget}
          onChange={(e) => set({ defaultTarget: e.target.value })}
          disabled={legacy}
          className={INPUT_CLASS}
        >
          <option value="self">This display (self)</option>
          {!legacy && <option value="all">All displays</option>}
          {displays.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {legacy && (
          <p className="text-[11px] text-hs-text-faint mt-0.5">
            Only one display registered — target is locked to this display.
          </p>
        )}
      </LabeledField>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!legacy && (c.allowRetargeting ?? false)}
          disabled={legacy}
          onChange={(e) => set({ allowRetargeting: e.target.checked })}
          className="accent-cyan-500"
        />
        <span className="text-xs text-hs-text-secondary">Allow user to change target at runtime</span>
      </label>
    </div>
  );
}
