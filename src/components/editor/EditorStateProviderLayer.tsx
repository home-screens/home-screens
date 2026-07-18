'use client';

import { useEffect, useMemo, useState } from 'react';
import { useEditorStore, getActiveScreens, getActiveRules } from '@/stores/editor-store';
import { usePluginStore } from '@/stores/plugin-store';
import PluginServiceLayer from '@/components/display/PluginServiceLayer';

/** How long the tab must stay hidden before providers are unmounted. */
const HIDDEN_GRACE_MS = 60_000;

/**
 * True once the document has been hidden for HIDDEN_GRACE_MS straight.
 * Provider poll loops share the per-plugin proxy rate budget with real
 * displays (240/min for localNetwork plugins), so a forgotten background
 * editor tab must not spend it forever — but a quick tab switch shouldn't
 * cold-start every provider either, hence the grace window. Values cleared
 * during the hidden stretch sit behind the tombstone grace and repopulate
 * within a poll cycle of the tab becoming visible again.
 */
function useHiddenLongEnough(): boolean {
  const [hiddenLongEnough, setHiddenLongEnough] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      if (document.hidden) {
        timer ??= setTimeout(() => setHiddenLongEnough(true), HIDDEN_GRACE_MS);
      } else {
        if (timer) clearTimeout(timer);
        timer = undefined;
        setHiddenLongEnough(false);
      }
    };
    onChange();
    document.addEventListener('visibilitychange', onChange);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onChange);
    };
  }, []);
  return hiddenLongEnough;
}

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

  const suspended = useHiddenLongEnough();

  if (!screens || suspended) return null;
  return <PluginServiceLayer screens={screens} rules={rules} />;
}
