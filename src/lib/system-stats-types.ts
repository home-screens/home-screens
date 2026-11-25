/**
 * Wire-format types for `/api/system/stats`. Shared between the server route
 * and its consumers (editor StatsSection, /remote SettingsSheet) so a field
 * added on one side doesn't go silently unconsumed on the other.
 */

import type { HardwareStats } from '@/lib/hardware-stats';
import type { GoogleAppsStatus } from '@/lib/google-apps';
import type { RestartNeeded } from '@/lib/restart-needed-state';
import type { ServiceAttention } from '@/lib/service-attention';

export interface DiskInfo {
  total: number;
  used: number;
  free: number;
  dataDir: {
    config: number;
    backups: number;
    backgrounds: number;
    total: number;
  };
}

export interface SystemStats {
  disk: DiskInfo;
  os: {
    hostname: string;
    platform: string;
    arch: string;
    uptime: number;
    nodeVersion: string;
    /**
     * The time zone data release this Node carries (`process.versions.tz`,
     * "2026e"). Every event time the hub works out goes through it, so a
     * stale copy is an hour off wherever a zone changed its rules since.
     */
    timeZoneData: string | null;
  };
  memory: {
    total: number;
    free: number;
    used: number;
  };
  app: {
    screens: number;
    modules: number;
    moduleTypes: Record<string, number>;
    profiles: number;
    configuredSecrets: string[];
    /** Which Google app Calendar and Photos sign in with; null when it couldn't be read. */
    googleApps: GoogleAppsStatus | null;
    /** Set-up services that are not working right now, by service id (`service-attention.ts`). */
    attention?: Partial<Record<string, ServiceAttention>>;
    configSize: number;
  };
  telemetry?: {
    installId: string | null;
    lastBeaconAt: string | null;
    enabled: boolean;
  };
  /** Hub's own in-process hardware snapshot. Falls back to this when the
   * selected display hasn't reported via the bash reporter. */
  hardware?: HardwareStats | null;
  /** An update this boot installed that the wall only picks up after a
   * restart. The phone's Settings sheet offers the restart. */
  restartNeeded?: RestartNeeded | null;
}
