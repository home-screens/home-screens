import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { isAuthEnabled } from '@/lib/auth';
import { getInstalledPlugins } from '@/lib/plugins';
import type { ScreenConfiguration } from '@/types/config';

/* ─── Constants ──────────────────────────────── */

const TELEMETRY_FILE = 'data/telemetry.json';
const BEACON_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const BEACON_TIMEOUT_MS = 5_000;
const BEACON_VERSION = 1;

const TELEMETRY_ENDPOINT = 'https://home-screens-telemetry.agent462.workers.dev/beacon';

/* ─── Types ──────────────────────────────────── */

export interface TelemetryData {
  installId: string;
  firstSeenAt: string;
  lastBeaconAt: string | null;
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
  beaconVersion: number;
  sentAt: string;
}

/* ─── File I/O ───────────────────────────────── */

function getTelemetryPath(): string {
  return path.join(process.cwd(), TELEMETRY_FILE);
}

export async function readTelemetryData(): Promise<TelemetryData | null> {
  try {
    const data = await fs.readFile(getTelemetryPath(), 'utf-8');
    return JSON.parse(data) as TelemetryData;
  } catch {
    return null;
  }
}

// Write queue prevents concurrent writes from racing on the .tmp file
let writeQueue: Promise<void> = Promise.resolve();

export async function writeTelemetryData(data: TelemetryData): Promise<void> {
  const next = writeQueue.then(async () => {
    const filePath = getTelemetryPath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = filePath + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmp, filePath);
  });
  writeQueue = next.catch(() => {});
  return next;
}

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

export async function buildBeaconPayload(
  config: ScreenConfiguration,
  telemetryData: TelemetryData,
): Promise<TelemetryBeacon> {
  const { settings, screens, profiles = [] } = config;

  // Count modules across all screens (collapse plugin:* to "plugin" for privacy)
  const moduleTypes: Record<string, number> = {};
  let moduleCount = 0;
  for (const screen of screens) {
    for (const mod of screen.modules) {
      const key = mod.type.startsWith('plugin:') ? 'plugin' : mod.type;
      moduleTypes[key] = (moduleTypes[key] || 0) + 1;
      moduleCount++;
    }
  }

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
    displayWidth: settings.displayWidth,
    displayHeight: settings.displayHeight,
    displayTransform: settings.displayTransform ?? '90',
    screenCount: screens.length,
    moduleCount,
    moduleTypes,
    profileCount: profiles.length,
    weatherProvider: settings.weather?.provider ?? 'openweathermap',
    transitionEffect: settings.transitionEffect ?? 'fade',
    sleepEnabled: settings.sleep?.enabled ?? false,
    alertsEnabled: settings.alerts?.enabled ?? false,
    authEnabled: authActive,
    hasGoogleCalendar: (settings.calendar?.googleCalendarIds?.length ?? 0) > 0,
    hasIcalSources: (settings.calendar?.icalSources?.length ?? 0) > 0,
    pluginCount: installedPlugins.plugins.length,
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
