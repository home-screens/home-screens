'use client';

import { useState, useEffect, useRef } from 'react';
import type { Screen, GlobalSettings, ScreenConfiguration, Profile, DisplayRule } from '@/types/config';
import type { InstalledPlugin } from '@/types/plugins';
import { displayCache } from '@/lib/display-cache';
import { displayFetch } from '@/lib/display-fetch';
import { filterConfigForDisplay, LEGACY_DISPLAY_ID } from '@/lib/display-filter';
import { dataFingerprint } from '@/lib/config-data-fingerprint';
import { stableStringify } from '@/lib/stable-stringify';
import { usePluginStore } from '@/stores/plugin-store';
import { HUB_TIMEZONE_HEADER, withHouseholdTimezone } from '@/lib/timezone';
import { logger } from '@/lib/logger';

const log = logger('display');

/**
 * Settings as the display runs them: the zone is always named. With none saved
 * it is the hub's, the zone the family's chores, lists and phone already
 * follow, never this kiosk's own. The type makes a stray machine-zone fallback
 * downstream a compile error rather than a wall an hour off the chore chart.
 */
export type DisplaySettings = GlobalSettings & { timezone: string };

/** Minimal display descriptor surfaced to modules that need to target displays */
export type DisplayDescriptor = { id: string; name: string };

/** How often the display polls for config changes (ms) */
const CONFIG_POLL_MS = 3_000;

/** Per-plugin settings fingerprints (lowercased id → stable-stringified settings). */
type SettingsFingerprints = Map<string, string>;

function fingerprintsEqual(a: SettingsFingerprints, b: SettingsFingerprints): boolean {
  if (a.size !== b.size) return false;
  for (const [id, fp] of a) {
    if (b.get(id) !== fp) return false;
  }
  return true;
}

/**
 * Poll /api/config and return live screens + settings + profiles,
 * falling back to the server-rendered props until the first successful fetch.
 *
 * When `displayId` is provided, the fetched config is filtered through
 * `filterConfigForDisplay` (the same pure function the server-side per-display
 * page uses) so the client view stays in lockstep with the server view.
 * In single-display mode (`displayId` undefined) no filtering is applied —
 * the rotator sees the entire config exactly as today.
 *
 * `hubTimezone` is the hub's own zone from the server render; each poll
 * replaces it with the one the config response names (`HUB_TIMEZONE_HEADER`).
 * Server and client start from the same zone, so the first client render
 * matches the server's HTML wherever the kiosk's own clock is set.
 */
export function useLiveConfig(
  initialScreens: Screen[],
  initialSettings: GlobalSettings,
  hubTimezone: string,
  initialProfiles?: Profile[],
  displayId?: string,
  initialDisplays?: DisplayDescriptor[],
  initialRules?: DisplayRule[],
) {
  const [screens, setScreens] = useState(initialScreens);
  const [settings, setSettings] = useState<DisplaySettings>(() => withHouseholdTimezone(initialSettings, hubTimezone));
  // Whether the zone in `settings` was saved or is the hub's standing in, for
  // anything on the wall or in Preview that should say no zone is set yet.
  const [timezoneSaved, setTimezoneSaved] = useState(() => !!initialSettings.timezone);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [rules, setRules] = useState(initialRules);
  const [displays, setDisplays] = useState<DisplayDescriptor[]>(initialDisplays ?? []);
  const configJsonRef = useRef<string>('');
  const hubTimezoneRef = useRef(hubTimezone);
  const dataFingerprintRef = useRef<string>('');
  const buildIdRef = useRef<string>('');
  const pluginHashRef = useRef<string>('');
  const settingsFpsRef = useRef<SettingsFingerprints | null>(null);
  // Re-entrancy guard: a plugin reload can outlast the poll interval on a
  // slow Pi — without this, the next tick would start a second reload while
  // the first is still swapping registrations.
  const pollInFlightRef = useRef(false);
  // Self-heal on display deletion: once the first successful poll has landed,
  // if a later poll finds the display missing from the config we hard-reload.
  // The server-side per-display page then either renders DisplayNotFound
  // (display gone) or remounts the rotator (display came back).
  const displayReloadingRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    // The ETag of the config answer last applied. Sent back on every poll, so
    // an unchanged config is a bodiless 304 instead of the whole document.
    let configEtag = '';

    /**
     * Reload the page when the server was redeployed.
     * Returns true when a reload is under way and the rest of the tick should stop.
     */
    async function checkBuildId(): Promise<boolean> {
      try {
        const buildRes = await displayFetch('/api/system/build-id');
        if (!buildRes.ok || !mounted) return false;
        const newBuildId = await buildRes.text();
        if (buildIdRef.current && newBuildId !== buildIdRef.current) {
          window.location.reload();
          return true;
        }
        buildIdRef.current = newBuildId;
      } catch {
        // A failed build-id check must not stop the config or plugin sync.
      }
      return false;
    }

    /**
     * Fetch and apply the config.
     * Returns true when a self-heal navigation is under way (display deleted).
     */
    async function syncConfig(): Promise<boolean> {
      try {
        // Ask for this display's slice. The response keeps every display's
        // id and name (display-control targets siblings by id) but only this
        // one's screens, so a wall no longer downloads and diffs every other
        // display's layout every 3 seconds. A single-display wall names the
        // legacy slot and gets the whole document. Naming a display at all
        // is what serves the poll from the hub's config cache.
        const res = await displayFetch(
          `/api/config?display=${encodeURIComponent(displayId ?? LEGACY_DISPLAY_ID)}`,
          configEtag ? { headers: { 'If-None-Match': configEtag } } : undefined,
        );
        // A 304 lands here too: nothing changed since the last answer applied.
        if (!res.ok || !mounted) return false;
        const text = await res.text();
        const hubZone = res.headers?.get?.(HUB_TIMEZONE_HEADER) || hubTimezoneRef.current;
        // Only update state when the JSON (or the hub's zone, which an unset
        // zone resolves to) actually changed
        const seen = `${hubZone}\n${text}`;
        if (seen !== configJsonRef.current) {
          const cfg: ScreenConfiguration = JSON.parse(text);
          // Resolved before the fingerprint and the per-display filter, so a
          // hub zone change clears zone-dependent data and every display
          // inherits the same named zone.
          const zoneSaved = !!cfg.settings?.timezone;
          if (cfg.settings) cfg.settings = withHouseholdTimezone(cfg.settings, hubZone);
          // Scoped invalidation: only clear the client cache when the change
          // can affect fetched data. Moves, resizes, restyles, schedule and
          // visibility edits keep every module's cached data warm — editing
          // one condition must not refetch the whole display.
          //
          // The dedupe ref advances only after the throwable parse +
          // fingerprint succeed: advancing first would let a thrown error
          // (swallowed by the outer catch) mark a config as "seen" without
          // ever applying it, freezing the display on the previous config
          // until the next byte-distinct change.
          const fingerprint = cfg.screens && cfg.settings ? dataFingerprint(cfg) : null;
          configJsonRef.current = seen;
          hubTimezoneRef.current = hubZone;
          if (fingerprint !== null && fingerprint !== dataFingerprintRef.current) {
            dataFingerprintRef.current = fingerprint;
            displayCache.clear();
          }
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
                setSettings(withHouseholdTimezone(filtered.settings, hubZone));
                setTimezoneSaved(zoneSaved);
                setProfiles(filtered.profiles);
                setRules(filtered.rules);
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
                return true;
              }
            } else {
              setScreens(cfg.screens);
              setSettings(withHouseholdTimezone(cfg.settings, hubZone));
              setTimezoneSaved(zoneSaved);
              setProfiles(cfg.profiles);
              setRules(cfg.rules);
            }
          }
        }
        // Only once the answer is applied: an answer that failed to parse
        // must be sent again in full, not waved through as unchanged.
        configEtag = res.headers?.get?.('ETag') ?? '';
      } catch (err) {
        // Keep the current config on failure. Logged rather than silent: a
        // permanently failing config poll is otherwise invisible on a kiosk.
        log.warn('Config poll failed:', err);
      }
      return false;
    }

    /** Reload plugins or push changed plugin settings. */
    async function syncPlugins(): Promise<void> {
      try {
        const pluginRes = await displayFetch('/api/plugins/installed');
        if (pluginRes.ok && mounted) {
          const pluginData = await pluginRes.json();
          const newHash = pluginData.pluginHash ?? '';
          const enabled: InstalledPlugin[] =
            (pluginData.plugins ?? []).filter((p: InstalledPlugin) => p.enabled);
          const newFps: SettingsFingerprints = new Map(
            enabled.map((p) => [p.id.toLowerCase(), stableStringify(p.settings ?? {})]),
          );
          if (pluginHashRef.current && newHash !== pluginHashRef.current) {
            // Plugin set changed — reload plugins, only commit hash on
            // success. loadPlugins resolves false (rather than rejecting)
            // when the reload was a no-op because its installed-list fetch
            // failed; keeping the old hash makes the next poll retry the
            // reload instead of believing the new set is already live.
            try {
              const ok = await usePluginStore.getState().loadPlugins('display');
              if (ok) {
                pluginHashRef.current = newHash;
                // loadAllPlugins refreshed the settings map wholesale
                settingsFpsRef.current = newFps;
              }
            } catch {
              // Don't advance hash — retry on next poll
            }
          } else {
            // The hash deliberately excludes settings (a settings save must
            // not remount every plugin) — diff them here and push into the
            // store instead. Entries whose settings didn't change keep
            // their object identity so their ProviderMount props stay
            // stable and provider effects don't re-fire.
            const prevFps = settingsFpsRef.current;
            if (prevFps && !fingerprintsEqual(prevFps, newFps)) {
              const store = usePluginStore.getState();
              const next = new Map<string, Record<string, unknown>>();
              for (const p of enabled) {
                const id = p.id.toLowerCase();
                const existing = store.pluginSettings.get(id);
                const unchanged = existing && prevFps.get(id) === newFps.get(id);
                next.set(id, unchanged ? existing : (p.settings ?? {}));
              }
              store.setPluginSettingsMap(next);
            }
            pluginHashRef.current = newHash;
            settingsFpsRef.current = newFps;
          }
        }
      } catch {
        // ignore plugin check failures
      }
    }

    /**
     * One tick: three independent jobs.
     *
     * Each job owns its own try/catch so a failure in one cannot skip the
     * others. They used to share a single `try` and a single early return, so a
     * transient `/api/config` failure also suspended plugin-change detection —
     * enable a plugin while that endpoint was briefly 500ing and the display
     * kept running the old plugin set with nothing logged.
     *
     * The outer `try` has only a `finally`: every exit path, present or future,
     * must release the re-entrancy guard. Leaking it would stop the kiosk from
     * picking up any config edit for the rest of its uptime, silently.
     */
    async function poll() {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        // A reload or self-heal navigation means this page is going away;
        // continuing the tick would race the unmount.
        if (await checkBuildId()) return;
        if (await syncConfig()) return;
        await syncPlugins();
      } finally {
        pollInFlightRef.current = false;
      }
    }

    poll();
    const id = setInterval(poll, CONFIG_POLL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [displayId]);

  return { screens, settings, timezoneSaved, profiles, rules, displays };
}
