/**
 * Wire-format types for `/api/system/stats`. Shared between the server route
 * and its consumers (editor StatsSection, /remote SettingsSheet) so a field
 * added on one side doesn't go silently unconsumed on the other.
 */

import type { HardwareStats } from '@/lib/hardware-stats';

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
}
