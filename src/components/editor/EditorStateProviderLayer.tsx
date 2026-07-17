'use client';

import { useEffect, useMemo } from 'react';
import { useEditorStore, getActiveScreens, getActiveRules } from '@/stores/editor-store';
import { usePluginStore } from '@/stores/plugin-store';
import PluginServiceLayer from '@/components/display/PluginServiceLayer';

/**
 * Mounts every plugin's `stateProvider` in the editor tab, fed by the DRAFT
 * config in the editor store — the display's `ScreenRotator` does the same
 * for saved config. This is what makes the conditions loop self-contained in
 * the editor: adding a condition creates demand immediately (before save),
 * the provider publishes to this tab's bus, and `useEditorSharedState` shows
 * live verdicts with zero display tabs open.
 *
 * Demand follows the SELECTED display, matching every verdict surface (they
 * all evaluate against `selectedDisplayId`); switching displays re-demands
 * and the providers clear no-longer-demanded keys behind the tombstone grace
 * window. Values stay in this tab's `sharedStateStore` — the editor never
 * reports a heartbeat, so nothing here reaches the hub or a real display.
 *
 * `PluginServiceLayer` reduces demand to a joined string before handing
 * providers their `demandedKeys` array, so the new `screens` identity the
 * store produces on every edit only churns provider effects when a
 * referenced key actually changed.
 */
export default function EditorStateProviderLayer() {
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);
  const loadPlugins = usePluginStore((s) => s.loadPlugins);

  // The layer owns its plugin dependency: it mounts from the (editor) layout
  // on routes that never load plugins themselves (/editor/settings), and the
  // canvas route's own call dedupes through loadPlugins' re-entrancy guard.
  // Bonus on the settings route: a populated plugin map upgrades the bus
  // inspector's producer labels from raw ids to manifest names.
  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  const screens = useMemo(
    () => (config ? getActiveScreens(config, selectedDisplayId) : null),
    [config, selectedDisplayId],
  );
  const rules = useMemo(
    () => (config ? getActiveRules(config, selectedDisplayId) : undefined),
    [config, selectedDisplayId],
  );

  if (!screens) return null;
  return <PluginServiceLayer screens={screens} rules={rules} />;
}
