import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { isAuthEnabled } from '@/lib/auth';
import { getInstalledPlugins } from '@/lib/plugins';
import { createJsonStore } from '@/lib/json-store';
import { filterConfigForDisplay } from '@/lib/display-filter';
import type { ScreenConfiguration, Screen } from '@/types/config';

/* ─── Constants ──────────────────────────────── */

const TELEMETRY_FILE = 'data/telemetry.json';
const BEACON_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const BEACON_TIMEOUT_MS = 5_000;
// v2 (2026-04-08) — added multi-display fields: displayCount, displays[],
// hasOwnedScreens, hasLegacyScreenIds, hasOwnedProfiles, hasSettingsOverride.
// sleepEnabled and alertsEnabled semantics widened to "any rendered surface
// will actually use this", evaluated against per-display effective settings.
const BEACON_VERSION = 2;

const TELEMETRY_ENDPOINT = 'https://home-screens-telemetry.agent462.workers.dev/beacon';

/* ─── Types ──────────────────────────────────── */

export interface TelemetryData {
  installId: string;
  firstSeenAt: string;
  lastBeaconAt: string | null;
}

/**
 * Per-display summary carried on the beacon's `displays` array.
 *
 * Carries dimensions, orientation, and aggregate counts — no display IDs or
 * names, because users pick those strings ("kitchen", "master-bedroom") and
 * they'd be PII-adjacent, the same reason `locationName` is excluded.
 */
interface DisplayBeaconEntry {
  /** Post-orientation width (matches what the rotator canvas renders at) */
  w: number;
  /** Post-orientation height */
  h: number;
  transform: 'normal' | '90' | '180' | '270';
  screenCount: number;
  moduleCount: number;
  /** True when this display owns its own `screens` list (preferred shape) */
  hasOwnedScreens: boolean;
  /** True when this display still references the deprecated `screenIds` pool */
  hasLegacyScreenIds: boolean;
  /** True when this display owns its own `profiles` list */
  hasOwnedProfiles: boolean;
  /** True when any DisplayNodeSettings override is present on this display */
  hasSettingsOverride: boolean;
}

interface TelemetryBeacon {
  installId: string;
  appVersion: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  displayWidth: number;
  displayHeight: number;
  displayTransform: string;
  screenCount: number;
  moduleCount: number;
  moduleTypes: Record<string, number>;
  profileCount: number;
  weatherProvider: string;
  transitionEffect: string;
  sleepEnabled: boolean;
  alertsEnabled: boolean;
  authEnabled: boolean;
  hasGoogleCalendar: boolean;
  hasIcalSources: boolean;
  pluginCount: number;
  /** 0 = legacy single-display mode, otherwise the number of registered displays */
  displayCount: number;
  /** Per-display breakdown; empty array in legacy single-display mode */
  displays: DisplayBeaconEntry[];
  /** True when any display in the registry uses owned `screens` */
  hasOwnedScreens: boolean;
  /** True when any display still uses the deprecated `screenIds`-from-pool shape */
  hasLegacyScreenIds: boolean;
  /** True when any display uses owned `profiles` */
  hasOwnedProfiles: boolean;
  /** True when any display carries a non-empty `settings` override block */
  hasSettingsOverride: boolean;
  beaconVersion: number;
  sentAt: string;
}

/* ─── File I/O ───────────────────────────────── */

const store = createJsonStore<TelemetryData | null>({
  path: TELEMETRY_FILE,
  defaultValue: null,
});

export const readTelemetryData = store.read;
export const writeTelemetryData = store.write;

/* ─── Install ID ─────────────────────────────── */

export async function getOrCreateInstallId(): Promise<TelemetryData> {
  const existing = await readTelemetryData();
  if (existing?.installId) return existing;

  const data: TelemetryData = {
    installId: uuidv4(),
    firstSeenAt: new Date().toISOString(),
    lastBeaconAt: null,
  };
  await writeTelemetryData(data);
  return data;
}

/* ─── Payload Assembly ───────────────────────── */

async function getPackageVersion(): Promise<string> {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const data = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(data);
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Count modules on a list of screens into a running tally, collapsing
 * `plugin:*` types to a single `plugin` bucket so plugin identifiers never
 * make it onto the wire (same privacy rule as the single-display original).
 * Returns the number of modules counted so the caller can bump moduleCount.
 */
function countModulesInto(
  screens: Screen[],
  moduleTypes: Record<string, number>,
): number {
  let n = 0;
  for (const screen of screens) {
    for (const mod of screen.modules) {
      const key = mod.type.startsWith('plugin:') ? 'plugin' : mod.type;
      moduleTypes[key] = (moduleTypes[key] || 0) + 1;
      n++;
    }
  }
  return n;
}

export async function buildBeaconPayload(
  config: ScreenConfiguration,
  telemetryData: TelemetryData,
): Promise<TelemetryBeacon> {
  const { settings, profiles = [] } = config;
  const displays = config.displays ?? [];
  const multiDisplay = displays.length > 0;

  // Module/screen counters. In multi-display mode we count ONLY from each
  // DisplayNode's effective screens — never from config.screens — because
  // the auto-created "main" display inherits config.screens at bootstrap,
  // so including both would double-count. Legacy mode counts config.screens
  // directly. See src/stores/editor-store.ts addDisplay comment.
  const moduleTypes: Record<string, number> = {};
  let moduleCount = 0;
  let screenCount = 0;

  // Per-display breakdown. Uses filterConfigForDisplay so we pick up orientation
  // normalization + DisplayNodeSettings merges in one shot; means any new
  // override flowing through the filter automatically shows up in telemetry
  // without re-implementing merge logic here.
  const displayEntries: DisplayBeaconEntry[] = [];
  let anyDisplaySleep = false;
  let anyDisplayAlerts = false;
  let hasOwnedScreens = false;
  let hasLegacyScreenIds = false;
  let hasOwnedProfiles = false;
  let hasSettingsOverride = false;

  if (multiDisplay) {
    for (const display of displays) {
      // Per-display try/catch — a malformed display.settings (e.g. a
      // primitive where an object is expected) would throw inside the
      // shallow-merge spread in filterConfigForDisplay. Skip the bad
      // display rather than dropping the entire beacon.
      let filtered;
      try {
        filtered = filterConfigForDisplay(config, display.id);
      } catch {
        continue;
      }
      // filterConfigForDisplay only returns null for unknown IDs — we're
      // iterating the registry itself so it should always resolve, but
      // guard anyway so a malformed config can't break the beacon.
      if (!filtered) continue;

      const displayModuleCount = countModulesInto(filtered.screens, moduleTypes);
      moduleCount += displayModuleCount;
      screenCount += filtered.screens.length;

      // `filtered.settings.sleep` already reflects the effective value for
      // this display: either the per-display override or, when none is set,
      // the inherited global value via the shallow merge. So a display with
      // no override that inherits a globally-on toggle correctly contributes
      // here, while a display that explicitly overrides sleep off does not.
      if (filtered.settings.sleep?.enabled) anyDisplaySleep = true;
      if (filtered.settings.alerts?.enabled) anyDisplayAlerts = true;

      const displayOwned = display.screens !== undefined;
      const displayLegacy = display.screens === undefined && display.screenIds !== undefined;
      const displayOwnedProfiles = display.profiles !== undefined;
      // Treat an empty {} settings block as no override — nobody writes
      // empty override objects on purpose, and counting them would inflate
      // the "uses per-display overrides" rollup.
      const displayHasOverride =
        display.settings !== undefined && Object.keys(display.settings).length > 0;
      if (displayOwned) hasOwnedScreens = true;
      if (displayLegacy) hasLegacyScreenIds = true;
      if (displayOwnedProfiles) hasOwnedProfiles = true;
      if (displayHasOverride) hasSettingsOverride = true;

      displayEntries.push({
        // filterConfigForDisplay already orients (long edge along landscape
        // axis for normal/180, portrait axis for 90/270), so these are the
        // true rendered canvas dimensions, not the author-declared values.
        w: filtered.settings.displayWidth,
        h: filtered.settings.displayHeight,
        transform: filtered.settings.displayTransform ?? '90',
        screenCount: filtered.screens.length,
        moduleCount: displayModuleCount,
        hasOwnedScreens: displayOwned,
        hasLegacyScreenIds: displayLegacy,
        hasOwnedProfiles: displayOwnedProfiles,
        hasSettingsOverride: displayHasOverride,
      });
    }
  } else {
    // Legacy single-display mode — original behavior.
    moduleCount = countModulesInto(config.screens, moduleTypes);
    screenCount = config.screens.length;
  }

  // Profile count aggregates the global pool + each display's owned profiles.
  // Displays that only use `profileIds` reference pool entries and would be
  // double-counted, so they're excluded from the sum.
  const ownedProfileSum = displays.reduce(
    (acc, d) => acc + (d.profiles?.length ?? 0),
    0,
  );
  const profileCount = profiles.length + ownedProfileSum;

  // sleep/alerts "enabled on any rendered surface". In multi-display mode
  // we trust the per-display walk above (anyDisplaySleep / anyDisplayAlerts)
  // because each `filtered.settings` already reflects the effective value
  // — either the per-display override or, when none is set, the inherited
  // global value. Crucially, when global is on but every display explicitly
  // overrides it off, the answer correctly comes back false.
  //
  // In legacy single-display mode (no displays registry), the multi-display
  // loop never runs, so we read the global toggle directly. The D1 column
  // semantics widen from "global toggle on?" (v1) to "any surface will
  // actually use this?" (v2).
  const sleepEnabled = multiDisplay
    ? anyDisplaySleep
    : (settings.sleep?.enabled ?? false);
  const alertsEnabled = multiDisplay
    ? anyDisplayAlerts
    : (settings.alerts?.enabled ?? false);

  // Gather platform info and feature flags in parallel
  const [appVersion, authActive, installedPlugins] = await Promise.all([
    getPackageVersion(),
    isAuthEnabled().catch(() => false),
    getInstalledPlugins().catch(() => ({ plugins: [] })),
  ]);

  return {
    installId: telemetryData.installId,
    appVersion,
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    // Top-level dimensions continue to point at the global settings so
    // historical v1 rows in D1 stay comparable with v2 rows on these
    // columns. Per-display breakdown lives in `displays[]`.
    displayWidth: settings.displayWidth,
    displayHeight: settings.displayHeight,
    displayTransform: settings.displayTransform ?? '90',
    screenCount,
    moduleCount,
    moduleTypes,
    profileCount,
    weatherProvider: settings.weather?.provider ?? 'openweathermap',
    transitionEffect: settings.transitionEffect ?? 'fade',
    sleepEnabled,
    alertsEnabled,
    authEnabled: authActive,
    hasGoogleCalendar: (settings.calendar?.googleCalendarIds?.length ?? 0) > 0,
    hasIcalSources: (settings.calendar?.icalSources?.length ?? 0) > 0,
    pluginCount: installedPlugins.plugins.length,
    displayCount: displays.length,
    displays: displayEntries,
    hasOwnedScreens,
    hasLegacyScreenIds,
    hasOwnedProfiles,
    hasSettingsOverride,
    beaconVersion: BEACON_VERSION,
    sentAt: new Date().toISOString(),
  };
}

/* ─── Beacon Sending ─────────────────────────── */

let sending = false;

export async function sendBeacon(payload: TelemetryBeacon): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BEACON_TIMEOUT_MS);
  try {
    const res = await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Main entry point — called from GET /api/config (fire-and-forget).
 * Checks opt-in and 24h interval, then sends.
 */
export async function maybeSendBeacon(config: ScreenConfiguration): Promise<void> {
  // Opt-out check: undefined means enabled (opt-out model)
  if (config.settings.telemetryEnabled === false) return;

  // Prevent concurrent sends (multiple /api/config requests within ms)
  if (sending) return;
  sending = true;

  try {
    const telemetryData = await getOrCreateInstallId();
    const now = Date.now();

    // Interval check: only send once per 24h
    if (telemetryData.lastBeaconAt) {
      const lastSent = new Date(telemetryData.lastBeaconAt).getTime();
      if (now - lastSent < BEACON_INTERVAL_MS) return;
    }

    // Write lastBeaconAt before sending to prevent beacon storms on disk/network errors.
    // Worst case: we skip one cycle (24h wait) if the send fails — the safe direction.
    telemetryData.lastBeaconAt = new Date().toISOString();
    await writeTelemetryData(telemetryData);

    const payload = await buildBeaconPayload(config, telemetryData);
    await sendBeacon(payload);
  } catch {
    // Never throw — telemetry must not break config serving
  } finally {
    sending = false;
  }
}
