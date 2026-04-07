'use client';

import { useState, useEffect, useRef } from 'react';
import type { Screen, GlobalSettings, ScreenConfiguration, Profile } from '@/types/config';
import { displayCache } from '@/lib/display-cache';
import { displayFetch } from '@/lib/display-fetch';
import { filterConfigForDisplay } from '@/lib/display-filter';
import { usePluginStore } from '@/stores/plugin-store';

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
) {
  const [screens, setScreens] = useState(initialScreens);
  const [settings, setSettings] = useState(initialSettings);
  const [profiles, setProfiles] = useState(initialProfiles);
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
                // running. Hard-reload so the server re-runs the filter and
                // renders DisplayNotFound (or a re-added display's rotator).
                // The guard prevents a reload loop if the reload itself
                // somehow fires the poll again before the page unmounts.
                displayReloadingRef.current = true;
                window.location.reload();
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

  return { screens, settings, profiles };
}
