'use client';

import { useMemo } from 'react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { usePluginStore } from '@/stores/plugin-store';
import { useTranslate } from '@/i18n';
import { collectProvidedStateKeys } from '@/lib/provided-state-keys';

/**
 * The household name of a state key, as the condition picker shows it:
 * "Temperature right now" for `weather.temperature`, a plugin's own label for
 * its keys. Undefined for a key nobody advertises, so the caller falls back to
 * the key itself. The same list the pickers build, so a chip and the picker
 * can never name one key two ways.
 */
export function useStateKeyLabel(): (key: string) => string | undefined {
  const t = useTranslate('editor');
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  // Plugins trigger the recompute; collectProvidedStateKeys reads the
  // registry, not the map. Matches VisibilityConditionsSection.
  const plugins = usePluginStore((s) => s.plugins);
  return useMemo(() => {
    if (!config) return () => undefined;
    const labels = new Map<string, string>();
    for (const entry of collectProvidedStateKeys(getActiveScreens(config, selectedDisplayId), { t, settings: config.settings })) {
      labels.set(entry.key, entry.label);
    }
    return (key: string) => labels.get(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plugins, see above
  }, [config, selectedDisplayId, plugins, t]);
}
