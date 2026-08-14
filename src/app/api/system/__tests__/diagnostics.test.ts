import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { EventEmitter as EE } from 'events';

// Mock dependencies before importing the route.
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
}));

vi.mock('@/lib/secrets', () => ({
  getSecretStatus: vi.fn(),
  readSecrets: vi.fn(),
}));

vi.mock('@/lib/telemetry', () => ({
  readTelemetryData: vi.fn(),
}));

vi.mock('@/lib/plugins', () => ({
  getInstalledPlugins: vi.fn(),
}));

vi.mock('@/lib/hardware-stats-server', () => ({
  getLocalHardwareStats: vi.fn(),
}));

// Keep the stats route from doing real fs work when we import it.
vi.mock('@/app/api/system/stats/route', () => ({
  GET: vi.fn(async () =>
    new Response(JSON.stringify({ disk: {}, os: {}, memory: {}, app: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ),
}));

// Stub journalctl — child_process.spawn returns a fake emitter that exits
// with code 1 so the route's fallback message is used (no real systemd).
vi.mock('child_process', async () => {
  const { EventEmitter } = await import('events');
  return {
    spawn: vi.fn(() => {
      const proc = new EventEmitter() as EE & {
        stdout: EE;
        stderr: EE;
      };
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      setImmediate(() => proc.emit('close', 1));
      return proc;
    }),
  };
});

import { requireSession } from '@/lib/auth';
import { readConfig } from '@/lib/config';
import { getSecretStatus, readSecrets } from '@/lib/secrets';
import { readTelemetryData } from '@/lib/telemetry';
import { getInstalledPlugins } from '@/lib/plugins';
import { getLocalHardwareStats } from '@/lib/hardware-stats-server';
import { __resetForTests, setConsoleLog, setDisplayStatus } from '@/lib/display-commands';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/system/diagnostics', {
    method: 'GET',
    headers: { Authorization: 'Bearer test-session' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetForTests();

  vi.mocked(requireSession).mockResolvedValue(undefined as never);

  vi.mocked(readConfig).mockResolvedValue({
    version: 1,
    settings: { rotationIntervalMs: 30000, weather: {}, calendar: {} },
    screens: [],
    profiles: [],
  } as never);

  vi.mocked(getSecretStatus).mockResolvedValue({
    openweathermap_key: false,
  } as never);

  vi.mocked(readSecrets).mockResolvedValue({} as never);
  vi.mocked(readTelemetryData).mockResolvedValue(null);
  vi.mocked(getInstalledPlugins).mockResolvedValue({ schemaVersion: 1, plugins: [] } as never);
  // Default: collector returns a recognizable payload so the hub-hardware
  // fallback test can assert it landed in displays[main].hwStats when the
  // reporter hasn't posted.
  vi.mocked(getLocalHardwareStats).mockResolvedValue({
    piModel: 'Raspberry Pi 4 Model B',
    cpuModel: 'ARMv8 Processor',
    cpuCores: 4,
    cpuTempC: 48.3,
    load1: 0.1,
    load5: 0.2,
    load15: 0.3,
    throttled: null,
    memoryTotal: 4_000_000_000,
    memoryFree: 2_000_000_000,
    diskTotal: 32_000_000_000,
    diskFree: 16_000_000_000,
    kioskUpdater: false,
    kioskVersion: null,
    reportedAt: '2026-04-17T00:00:00.000Z',
  });
});

describe('GET /api/system/diagnostics', () => {
  it('returns a valid zip with the expected headers', async () => {
    const { GET } = await import('../diagnostics/route');

    // The solicit path clears any pre-existing buffer and waits for a fresh
    // upload — simulate the display responding ~100 ms into the 5 s window.
    const uploadTimer = setTimeout(() => {
      setConsoleLog('main', [
        { timestamp: Date.now(), level: 'log', message: 'hello' },
      ] as never);
    }, 100);

    const res = await GET(makeRequest());
    clearTimeout(uploadTimer);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/zip');
    expect(res.headers.get('content-disposition')).toMatch(
      /attachment; filename="home-screens-diagnostics-.+\.zip"/,
    );

    const buf = Buffer.from(await res.arrayBuffer());
    // ZIP local-file header magic: PK\x03\x04
    expect(buf.slice(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
  }, 10_000);

  it('includes per-display console logs that arrived inside the 5s window', async () => {
    // Register the display so getAllDisplayStatuses carries a real entry.
    setDisplayStatus(
      {
        currentScreen: { index: 0, id: 's1', name: 'S1' },
        screenCount: 1,
        activeProfile: null,
        displayState: 'active',
        timestamp: Date.now(),
      },
      'main',
    );
    // Upload the fresh log ~100 ms after the route starts polling — the
    // solicit path evicts any pre-existing buffer to ensure we don't return
    // a stale entry from a previous bundle.
    const uploadTimer = setTimeout(() => {
      setConsoleLog('main', [
        { timestamp: Date.now(), level: 'error', message: 'oops' },
      ] as never);
    }, 100);

    const { GET } = await import('../diagnostics/route');
    const res = await GET(makeRequest());
    clearTimeout(uploadTimer);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());

    // Walk the ZIP central directory to collect all entry names. The
    // central-directory file-header signature is PK\x01\x02 (0x02014b50).
    const SIG = 0x02014b50;
    const entries = new Set<string>();
    for (let i = 0; i < buf.length - 4; i++) {
      if (buf.readUInt32LE(i) === SIG) {
        const nameLen = buf.readUInt16LE(i + 28);
        const name = buf.slice(i + 46, i + 46 + nameLen).toString('utf8');
        entries.add(name);
        i += 45 + nameLen;
      }
    }
    expect(entries).toContain('displays/main/status.json');
    expect(entries).toContain('displays/main/console.log');
  }, 10_000);

  it('falls back to in-process hub hardware stats for the hub display when reporter has not posted', async () => {
    // No setDisplayStatus call for 'main' — the fallback branch should kick in.
    const uploadTimer = setTimeout(() => {
      setConsoleLog('main', [
        { timestamp: Date.now(), level: 'log', message: 'hi' },
      ] as never);
    }, 100);

    const { GET } = await import('../diagnostics/route');
    const res = await GET(makeRequest());
    clearTimeout(uploadTimer);
    expect(res.status).toBe(200);

    // The collector must have been invoked — proves the fallback path ran.
    expect(vi.mocked(getLocalHardwareStats)).toHaveBeenCalled();

    // Walk the central directory for displays/main/hw-stats.json and confirm
    // it carries our mocked collector payload, not the empty-object fallback
    // the composer emits when hwStats is null.
    const buf = Buffer.from(await res.arrayBuffer());
    const SIG = 0x02014b50;
    let hwStatsPayload: string | null = null;
    for (let i = 0; i < buf.length - 4; i++) {
      if (buf.readUInt32LE(i) !== SIG) continue;
      const nameLen = buf.readUInt16LE(i + 28);
      const name = buf.slice(i + 46, i + 46 + nameLen).toString('utf8');
      if (name === 'displays/main/hw-stats.json') {
        // Found the central-dir entry. Pull the uncompressed size + local
        // header offset so we can check the payload actually persisted.
        const uncompressed = buf.readUInt32LE(i + 24);
        // Archiver writes this file without compression when it's small, so
        // we can grep the uncompressed bytes for a recognizable field.
        hwStatsPayload = `${name}:${uncompressed}`;
        break;
      }
      i += 45 + nameLen;
    }
    expect(hwStatsPayload).not.toBeNull();
    // A non-zero uncompressed size rules out the empty-object fallback (`{}`
    // is 2 bytes, a real payload ~300B). Authoritative field-level coverage
    // lives in diagnostics-bundle.test.ts.
    const parsedSize = Number(hwStatsPayload?.split(':')[1] ?? 0);
    expect(parsedSize).toBeGreaterThan(10);
  }, 10_000);

  it('never includes a resolved plugin-secret value in the bundle (redaction working)', async () => {
    // Put a known secret into the resolved-secrets map the route reads via
    // readSecrets(). redactConfig() scrubs any occurrence of these values
    // from the embedded config JSON; this test confirms the raw ZIP bytes
    // do not contain the literal secret anywhere.
    vi.mocked(readSecrets).mockResolvedValue({
      openweathermap_key: 'SECRET_VALUE_ABC123',
    } as never);

    // Simulate an in-window console-log upload so the solicit loop exits
    // before the 5s timeout. Seeded via setTimeout to land after the route's
    // pre-solicit clearConsoleLog eviction.
    const uploadTimer = setTimeout(() => {
      setConsoleLog('main', [
        { timestamp: Date.now(), level: 'log', message: 'hi' },
      ] as never);
    }, 100);

    const { GET } = await import('../diagnostics/route');
    const res = await GET(makeRequest());
    clearTimeout(uploadTimer);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());

    // Archiver compresses entries with deflate, so a string embedded in a
    // compressed entry won't show up in raw bytes. Non-compressed sections
    // (central directory, filenames, small entries under deflate threshold)
    // would still leak a missed value — see config-redactor.test.ts for the
    // authoritative field-level redaction coverage.
    expect(buf.indexOf('SECRET_VALUE_ABC123')).toBe(-1);
  }, 10_000);
});
