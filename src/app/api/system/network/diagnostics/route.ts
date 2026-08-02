import { NextResponse } from 'next/server';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { withAuth } from '@/lib/api-utils';
import type {
  GatewayResult,
  WatchdogResult,
  DiagnosticsResult,
} from '@/lib/network-types';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFileCb);

/* ─── Helpers ───────────────────────────────── */

/**
 * Parse ping latency from output like:
 *   64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=1.23 ms
 * Returns null if not found.
 */
function parsePingLatency(output: string): number | null {
  const match = output.match(/time[=<]([\d.]+)\s*ms/);
  if (!match) return null;
  return parseFloat(match[1]);
}

/**
 * Ping a single host once with a 3-second timeout.
 * Returns { reachable, latencyMs }.
 */
async function pingHost(host: string): Promise<{ reachable: boolean; latencyMs: number | null }> {
  try {
    const { stdout } = await execFileAsync(
      'ping',
      ['-c', '1', '-W', '3', host],
      { timeout: 5000 },
    );
    const latencyMs = parsePingLatency(stdout);
    return { reachable: latencyMs !== null, latencyMs };
  } catch {
    return { reachable: false, latencyMs: null };
  }
}

/**
 * Get the default gateway IP from `ip route show default`.
 * Returns null if not found or command unavailable.
 */
async function getDefaultGateway(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'ip',
      ['route', 'show', 'default'],
      { timeout: 5000 },
    );
    // Output format: default via 192.168.1.1 dev eth0 ...
    const match = stdout.match(/default via ([\d.]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Check if the wifi-watchdog.timer systemd unit is active and when it last ran.
 */
async function getWatchdogStatus(): Promise<WatchdogResult> {
  let active = false;
  let lastRun: string | null = null;

  try {
    const { stdout } = await execFileAsync(
      'systemctl',
      ['is-active', 'wifi-watchdog.timer'],
      { timeout: 5000 },
    );
    active = stdout.trim() === 'active';
  } catch {
    // Non-zero exit means inactive or not found — active stays false
  }

  try {
    const { stdout } = await execFileAsync(
      'systemctl',
      ['show', 'wifi-watchdog.timer', '-p', 'LastTriggerUSec'],
      { timeout: 5000 },
    );
    // Output: LastTriggerUSec=Sat 2025-01-01 12:00:00 UTC
    const match = stdout.trim().match(/^LastTriggerUSec=(.+)$/);
    if (match && match[1] && match[1] !== 'n/a' && match[1] !== '0') {
      // Try to parse it — systemd uses a custom format; convert best effort
      const raw = match[1].trim();
      if (raw && raw !== 'n/a' && raw !== '0') {
        // Attempt to create a Date from the systemd timestamp string
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
          lastRun = d.toISOString();
        } else {
          // Store as raw string if it can't be parsed to a Date
          lastRun = raw;
        }
      }
    }
  } catch {
    // Best-effort — lastRun stays null
  }

  return { active, lastRun };
}

/* ─── Route handler ─────────────────────────── */

export const GET = withAuth(async () => {
  // Check if ping is available (also implicitly checks we're on Linux)
  try {
    await execFileAsync('ping', ['-c', '1', '-W', '1', '127.0.0.1'], { timeout: 3000 });
  } catch (err: unknown) {
    const isNotFound =
      err && typeof err === 'object' && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
    if (isNotFound) {
      return NextResponse.json({ available: false } satisfies DiagnosticsResult);
    }
    // ping returned non-zero for loopback — unusual but ping is still available
  }

  // Run all diagnostics in parallel
  const [gatewayIp, internetResult, watchdog] = await Promise.all([
    getDefaultGateway(),
    pingHost('1.1.1.1'),
    getWatchdogStatus(),
  ]);

  // Ping gateway if we found one
  let gateway: GatewayResult | undefined;
  if (gatewayIp) {
    const gatewayPing = await pingHost(gatewayIp);
    gateway = {
      ip: gatewayIp,
      reachable: gatewayPing.reachable,
      latencyMs: gatewayPing.latencyMs,
    };
  }

  const result: DiagnosticsResult = {
    available: true,
    gateway,
    internet: {
      ip: '1.1.1.1',
      reachable: internetResult.reachable,
      latencyMs: internetResult.latencyMs,
    },
    watchdog,
  };

  return NextResponse.json(result);
}, 'Failed to run diagnostics');
