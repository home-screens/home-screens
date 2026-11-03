/**
 * In-process hardware-stats collector. Runs on the hub and reads /proc, /sys,
 * and a few OS-level sources directly. No child processes, no systemd timer,
 * no network round-trip — this is what `displayStatus.hwStats` for the hub's
 * own displays falls back to when the bash reporter hasn't posted.
 *
 * Shape matches the bash reporter's payload so the UI renders identically.
 * Fields that aren't readable on the current platform become null (e.g. on
 * macOS dev boxes, piModel/cpuTempC/throttled are null).
 */

import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { getDataRoot } from './data-root';
import type { HardwareStats, ThrottledInfo } from './hardware-stats';

/** The programs the kiosk runs whose versions the Stats page shows. */
const REPORTED_PACKAGES = ['chromium', 'labwc', 'kanshi', 'wlopm'];

const CACHE_TTL_MS = 5_000;

let cached: { at: number; stats: HardwareStats } | null = null;
// Coalesces concurrent callers within the same tick. Without this, two
// callers arriving before the cache is warm each spawn vcgencmd and re-read
// /proc — cheap per call, but vcgencmd forks stall the event loop on an
// 8-year-old Pi Zero. Both callers await the same promise; only one spawns.
let pending: Promise<HardwareStats> | null = null;

async function readText(path: string): Promise<string | null> {
  try {
    return (await fs.readFile(path, 'utf8')).replace(/\0/g, '').trim();
  } catch {
    return null;
  }
}

async function readPiModel(): Promise<string | null> {
  return readText('/sys/firmware/devicetree/base/model');
}

async function readCpuModel(): Promise<string | null> {
  const cpuinfo = await readText('/proc/cpuinfo');
  if (!cpuinfo) return null;
  for (const line of cpuinfo.split('\n')) {
    const m = /^(?:Model|model name)\s*:\s*(.+)$/.exec(line);
    if (m) return m[1].trim();
  }
  return null;
}

async function readCpuTempC(): Promise<number | null> {
  const raw = await readText('/sys/class/thermal/thermal_zone0/temp');
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round((n / 1000) * 10) / 10;
}

async function readThrottled(): Promise<ThrottledInfo | null> {
  // vcgencmd only ships on Raspberry Pi OS. Shell out with a tight timeout —
  // this file is in the hot path for the stats page, not the diagnostics
  // bundle, so the usual 10 s spawn ceiling is too loose.
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = (v: ThrottledInfo | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(v);
    };
    try {
      const proc = spawn('vcgencmd', ['get_throttled'], { stdio: ['ignore', 'pipe', 'ignore'] });
      const chunks: Buffer[] = [];
      proc.stdout.on('data', (c) => chunks.push(c as Buffer));
      proc.on('close', (code) => {
        if (code !== 0) return done(null);
        const out = Buffer.concat(chunks).toString('utf8').trim();
        const m = /throttled=0x([0-9a-fA-F]+)/.exec(out);
        if (!m) return done(null);
        const dec = parseInt(m[1], 16);
        done({
          raw: `0x${m[1]}`,
          active: (dec & 0x7) !== 0,
          underVoltage: (dec & 0x1) !== 0,
          previouslyThrottled: (dec & 0x70000) !== 0,
        });
      });
      proc.on('error', () => done(null));
      // Fallback timer — if vcgencmd hangs, we don't want the stats page to
      // hang with it. Cleared in done() so a successful close doesn't leave
      // a ref in the event loop for 500 ms after we've already resolved.
      timer = setTimeout(() => {
        if (!settled) proc.kill('SIGKILL');
        done(null);
      }, 500);
    } catch {
      done(null);
    }
  });
}

async function readDiskRoot(): Promise<{ total: number; free: number }> {
  try {
    const s = await fs.statfs('/');
    return { total: s.bsize * s.blocks, free: s.bsize * s.bavail };
  } catch {
    return { total: 0, free: 0 };
  }
}

/**
 * Installed versions from dpkg, or null where there is no dpkg-query (the
 * spawn error path). Deliberately not gated on process.platform: the
 * production build inlines that constant from the machine that built it, so
 * a bundle built on a Mac would carry `return null` here for good.
 */
async function readPackages(): Promise<Record<string, string> | null> {
  const out = await new Promise<string | null>((resolve) => {
    let stdout = '';
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('dpkg-query', ['-W', '-f=${Package}\t${Version}\n', ...REPORTED_PACKAGES], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 3_000);
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    // A package dpkg does not know makes it exit 1 after printing the rest, so
    // the output counts whatever the status.
    child.on('close', () => { clearTimeout(timer); resolve(stdout); });
  });
  if (!out) return null;
  const packages: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const [name, version] = line.split('\t');
    if (name && version) packages[name] = version.trim();
  }
  return Object.keys(packages).length > 0 ? packages : null;
}

/** When setup-system last looked for newer versions (data/system-packages.json). */
async function readPackagesCheckedAt(): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(getDataRoot(), 'data', 'system-packages.json'), 'utf8');
    const parsed = JSON.parse(raw) as { checkedAt?: unknown };
    return typeof parsed.checkedAt === 'string' && !Number.isNaN(new Date(parsed.checkedAt).getTime())
      ? parsed.checkedAt
      : null;
  } catch {
    return null;
  }
}

/**
 * Collect current hardware stats. Results are cached for 5 s so repeated
 * hits (editor stats page refresh + diagnostics bundle request in the same
 * tick) don't each re-spawn vcgencmd and re-read /proc.
 *
 * Concurrent callers that arrive before the cache is warm all await the
 * same in-flight promise, not N parallel collectors racing to write the
 * same cache entry.
 */
export async function getLocalHardwareStats(): Promise<HardwareStats> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.stats;
  }
  if (pending) return pending;

  pending = (async () => {
    try {
      const [piModel, cpuModel, cpuTempC, throttled, disk, packages, packagesCheckedAt] = await Promise.all([
        readPiModel(),
        readCpuModel(),
        readCpuTempC(),
        readThrottled(),
        readDiskRoot(),
        readPackages(),
        readPackagesCheckedAt(),
      ]);

      const [load1, load5, load15] = os.loadavg();
      const cpuCores = os.cpus().length || 1;
      const memoryTotal = os.totalmem();
      const memoryFree = os.freemem();

      const stats: HardwareStats = {
        piModel,
        cpuModel: cpuModel ?? os.cpus()[0]?.model ?? null,
        cpuCores,
        cpuTempC,
        load1,
        load5,
        load15,
        throttled,
        memoryTotal,
        memoryFree,
        diskTotal: disk.total,
        diskFree: disk.free,
        // These describe a display-only Pi's locally-installed shell layer.
        // This collector runs on the hub itself, which has no such layer to
        // update — the hub updates through the normal Updates page.
        kioskUpdater: false,
        kioskVersion: null,
        packages,
        packagesCheckedAt,
        reportedAt: new Date().toISOString(),
      };

      cached = { at: Date.now(), stats };
      return stats;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Test-only cache reset. */
export function __resetHardwareStatsCacheForTests(): void {
  cached = null;
  pending = null;
}
