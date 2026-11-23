'use client';

import Toggle from '@/components/ui/Toggle';
import LabeledInput from '@/components/ui/LabeledInput';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useEditorStore } from '@/stores/editor-store';
import { hasValidLocation } from '@/lib/location';
import { useTranslate } from '@/i18n';
import type { ModuleInstance } from '@/types/config';
import ColorPicker from '@/components/ui/ColorPicker';
import { settingsPlaceText } from '@/lib/settings-route';

export function GreetingConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const { config: c, set } = useModuleConfig<{ name?: string; accentColor?: string; weatherAware?: boolean }>(mod, screenId);
  const lat = useEditorStore((s) => s.config?.settings?.latitude);
  const lon = useEditorStore((s) => s.config?.settings?.longitude);
  const hasLocation = hasValidLocation(lat, lon);
  const weatherAware = c.weatherAware ?? true;

  return (
    <>
      <LabeledInput
        label={t('configSections.greeting.name')}
        value={(c.name as string) || t('configSections.greeting.defaultName')}
        onChange={(v) => set({ name: v })}
      />
      <ColorPicker
        label={t('accentColorPicker.label')}
        swatches="accent-or-none"
        value={c.accentColor ?? '#000000'}
        onChange={(v) => set({ accentColor: v })}
      />
      <Toggle
        label={t('configSections.greeting.weatherAware')}
        checked={weatherAware}
        onChange={(v) => set({ weatherAware: v })}
      />
      {weatherAware && !hasLocation && (
        <p className="text-xs text-hs-warning-ink">
          {t('configSections.greeting.locationRequired', { place: settingsPlaceText(tCore, 'location') })}
        </p>
      )}
    </>
  );
}
