'use client';

import AccentColorPicker from '@/components/ui/AccentColorPicker';
import Toggle from '@/components/ui/Toggle';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useEditorStore } from '@/stores/editor-store';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance } from '@/types/config';

export function GreetingConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{ name?: string; accentColor?: string; weatherAware?: boolean }>(mod, screenId);
  const lat = useEditorStore((s) => s.config?.settings?.latitude ?? s.config?.settings?.weather?.latitude);
  const lon = useEditorStore((s) => s.config?.settings?.longitude ?? s.config?.settings?.weather?.longitude);
  const hasLocation = lat != null && lon != null && !(lat === 0 && lon === 0);
  const weatherAware = c.weatherAware ?? true;

  return (
    <>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Name</span>
        <input
          type="text"
          value={(c.name as string) || 'Friend'}
          onChange={(e) => set({ name: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <AccentColorPicker
        value={c.accentColor ?? '#000000'}
        onChange={(v) => set({ accentColor: v })}
      />
      <Toggle
        label="Weather-Aware Greeting"
        checked={weatherAware}
        onChange={(v) => set({ weatherAware: v })}
      />
      {weatherAware && !hasLocation && (
        <p className="text-xs text-hs-warning">
          Set your location in Settings &gt; Weather to enable weather-aware greetings.
        </p>
      )}
    </>
  );
}
