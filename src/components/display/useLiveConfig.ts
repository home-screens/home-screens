'use client';

import { useState, useEffect, useRef } from 'react';
import type { Screen, GlobalSettings, ScreenConfiguration, Profile } from '@/types/config';
import { displayCache } from '@/lib/display-cache';
import { displayFetch } from '@/lib/display-fetch';
import { filterConfigForDisplay } from '@/lib/display-filter';
import { usePluginStore } from '@/stores/plugin-store';

/** Minimal display descriptor surfaced to modules that need to target displays */
export type DisplayDescriptor = { id: string; name: string };

/** How often the display polls for config changes (ms) */
const CONFIG_POLL_MS = 3_000;

/**
 * Poll /api/config and return live screens + settings + profiles,
 * falling back to the server-rendered props until the first successful fetch.
 *
 * When `displayId` is provided, the fetched config is filtered through
 * `filterConfigForDisplay` (the same pure function the server-side per-display
 * page uses) so the client view stays in lockstep with the server view.
 * In single-display mode (`displayId` undefined) no filtering is applied —
 * the rotator sees the entire config exactly as today.
 */
export function useLiveConfig(
  initialScreens: Screen[],
  initialSettings: GlobalSettings,
  initialProfiles?: Profile[],
  displayId?: string,
  initialDisplays?: DisplayDescriptor[],
) {
  const [screens, setScreens] = useState(initialScreens);
  const [settings, setSettings] = useState(initialSettings);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [displays, setDisplays] = useState<DisplayDescriptor[]>(initialDisplays ?? []);
  const configJsonRef = useRef<string>('');
  const buildIdRef = useRef<string>('');
  const pluginHashRef = useRef<string>('');
  // Self-heal on display deletion: once the first successful poll has landed,
  // if a later poll finds the display missing from the config we hard-reload.
  // The server-side per-display page then either renders DisplayNotFound
  // (display gone) or remounts the rotator (display came back).
  const displayReloadingRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        // Check for new build — reload the page if the server was redeployed
        const buildRes = await displayFetch('/api/system/build-id');
        if (buildRes.ok && mounted) {
          const newBuildId = await buildRes.text();
          if (buildIdRef.current && newBuildId !== buildIdRef.current) {
            window.location.reload();
            return;
          }
          buildIdRef.current = newBuildId;
        }

        const res = await displayFetch('/api/config');
        if (!res.ok || !mounted) return;
        const text = await res.text();
        // Only update state when the JSON actually changed
        if (text !== configJsonRef.current) {
          configJsonRef.current = text;
          displayCache.clear(); // invalidate client cache on config change
          const cfg: ScreenConfiguration = JSON.parse(text);
          if (cfg.screens && cfg.settings) {
            // Update the displays registry for any module that needs it (e.g. display-control)
            setDisplays(
              cfg.displays?.map((d) => ({ id: d.id, name: d.name })) ?? [],
            );
            if (displayId) {
              // Multi-display mode: filter through the same pure function the
              // server's per-display page uses, so the two cannot drift.
              const filtered = filterConfigForDisplay(cfg, displayId);
              if (filtered) {
                setScreens(filtered.screens);
                setSettings(filtered.settings);
                setProfiles(filtered.profiles);
              } else if (!displayReloadingRef.current) {
                // Display was removed from the config while this Pi was
                // running. Navigate to the canonical `/display` entry point
                // (NOT a same-URL reload): reloading would just bounce us
                // into DisplayNotFound on a dead URL, while /display lets
                // the server-side redirect land us on whichever display is
                // now the default. The guard prevents a navigation loop if
                // the navigation itself somehow fires the poll again before
                // the page unmounts.
                displayReloadingRef.current = true;
                window.location.href = '/display';
                return;
              }
            } else {
              setScreens(cfg.screens);
              setSettings(cfg.settings);
              setProfiles(cfg.profiles);
            }
          }
        }
        // Check for plugin changes
        try {
          const pluginRes = await displayFetch('/api/plugins/installed');
          if (pluginRes.ok && mounted) {
            const pluginData = await pluginRes.json();
            const newHash = pluginData.pluginHash ?? '';
            if (pluginHashRef.current && newHash !== pluginHashRef.current) {
              // Plugin set changed — reload plugins, only commit hash on success
              try {
                await usePluginStore.getState().loadPlugins();
                pluginHashRef.current = newHash;
              } catch {
                // Don't advance hash — retry on next poll
              }
            } else {
              pluginHashRef.current = newHash;
            }
          }
        } catch {
          // ignore plugin check failures
        }
      } catch {
        // keep current config on failure
      }
    }

    poll();
    const id = setInterval(poll, CONFIG_POLL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [displayId]);

  return { screens, settings, profiles, displays };
}
