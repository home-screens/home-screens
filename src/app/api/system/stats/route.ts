import { NextResponse } from 'next/server';
import os from 'os';
import { promises as fs } from 'fs';
import path from 'path';
import { withAuth } from '@/lib/api-utils';
import { readConfig } from '@/lib/config';
import { getSecretStatus } from '@/lib/secrets';
import { readTelemetryData } from '@/lib/telemetry';
import { getLocalHardwareStats } from '@/lib/hardware-stats-server';
import { BACKGROUNDS_DIR } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/** Recursively sum file sizes in a directory. Returns 0 if directory doesn't exist. */
async function dirSize(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await dirSize(fullPath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        total += stat.size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/** Get the size of a single file. Returns 0 if it doesn't exist. */
async function fileSize(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

export const GET = withAuth(async () => {
  const cwd = process.cwd();
  const dataDir = path.join(cwd, 'data');
  const backgroundsDir = path.join(cwd, BACKGROUNDS_DIR);

  // Gather all stats in parallel
  const [
    configSize,
    backupsSize,
    backgroundsSize,
    diskStats,
    config,
    secretStatus,
    telemetryData,
    hardware,
  ] = await Promise.all([
    fileSize(path.join(dataDir, 'config.json')),
    dirSize(path.join(dataDir, 'backups')),
    dirSize(backgroundsDir),
    getDiskStats(cwd),
    readConfig().catch(() => null),
    getSecretStatus().catch(() => ({} as Record<string, boolean>)),
    readTelemetryData().catch(() => null),
    getLocalHardwareStats().catch(() => null),
  ]);

  // Count modules across all screens
  const screens = config?.screens ?? [];
  const moduleTypeCounts: Record<string, number> = {};
  let totalModules = 0;
  for (const screen of screens) {
    for (const mod of screen.modules) {
      totalModules++;
      moduleTypeCounts[mod.type] = (moduleTypeCounts[mod.type] ?? 0) + 1;
    }
  }

  // Determine configured integrations
  const configuredSecrets = Object.entries(secretStatus)
    .filter(([, configured]) => configured)
    .map(([key]) => key);

  const dataDirTotal = configSize + backupsSize + backgroundsSize;

  return NextResponse.json({
    disk: {
      total: diskStats.total,
      used: diskStats.used,
      free: diskStats.free,
      dataDir: {
        config: configSize,
        backups: backupsSize,
        backgrounds: backgroundsSize,
        total: dataDirTotal,
      },
    },
    os: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptime: os.uptime(),
      nodeVersion: process.version,
    },
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
    },
    app: {
      screens: screens.length,
      modules: totalModules,
      moduleTypes: moduleTypeCounts,
      profiles: config?.profiles?.length ?? 0,
      configuredSecrets,
      configSize,
    },
    telemetry: {
      installId: telemetryData?.installId
        ? telemetryData.installId.slice(0, 8) + '...'
        : null,
      lastBeaconAt: telemetryData?.lastBeaconAt ?? null,
      enabled: config?.settings?.telemetryEnabled !== false,
    },
    hardware,
  });
}, 'Failed to gather system stats');

/** Get filesystem stats using Node's fs.statfs */
async function getDiskStats(dir: string): Promise<{ total: number; used: number; free: number }> {
  try {
    const stats = await fs.statfs(dir);
    const total = stats.bsize * stats.blocks;
    const free = stats.bsize * stats.bavail;
    return { total, used: total - free, free };
  } catch {
    return { total: 0, used: 0, free: 0 };
  }
}
