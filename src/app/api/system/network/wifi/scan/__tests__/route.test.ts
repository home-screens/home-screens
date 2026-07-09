/**
 * Route-level tests for `GET /api/system/network/wifi/scan`.
 *
 * Mocks `network-commands` (rescan + list). The handler waits ~4s between the
 * rescan trigger and the list, so tests use fake timers and flush them with
 * `runAllTimersAsync`. Each test uses a distinct interface name to sidestep the
 * module-level 15s scan cache. The real interface validator runs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

vi.mock('@/lib/network-commands', () => ({
  nmcli: vi.fn(async () => ''),
  nmcliSudo: vi.fn(async () => ''),
}));

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { nmcli } from '@/lib/network-commands';

const mockNmcli = vi.mocked(nmcli);

function getRequest(iface: string): NextRequest {
  return new NextRequest(`http://localhost/api/system/network/wifi/scan?iface=${iface}`, { method: 'GET' });
}

// Drive the handler past its internal 4s wait.
async function runScan(iface: string) {
  const promise = GET(getRequest(iface));
  await vi.runAllTimersAsync();
  return promise;
}

describe('GET /api/system/network/wifi/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects an invalid interface name with 400', async () => {
    const res = await GET(getRequest('bad iface!'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Interface name/);
  });

  it('scans and returns parsed, saved-flagged networks', async () => {
    mockNmcli.mockImplementation(async (args: string[]) => {
      const j = args.join(' ');
      // Saved connections list (NAME:TYPE)
      if (j.includes('-f NAME,TYPE')) return 'HomeNet:802-11-wireless\nWired:802-3-ethernet';
      // Scan results: SSID:BSSID:SIGNAL:SECURITY:FREQ:IN-USE
      if (j.includes('device wifi list')) {
        return (
          'HomeNet:AA\\:BB\\:CC\\:DD\\:EE\\:FF:80:WPA2:2412 MHz:*\n' +
          'Neighbor:11\\:22\\:33\\:44\\:55\\:66:40:WPA3:5180 MHz:'
        );
      }
      return '';
    });

    const res = await runScan('wlan0');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    const home = body.find((n: { ssid: string }) => n.ssid === 'HomeNet');
    expect(home).toMatchObject({ signal: 80, security: 'WPA2', frequency: 2412, inUse: true, saved: true });
    const neighbor = body.find((n: { ssid: string }) => n.ssid === 'Neighbor');
    expect(neighbor).toMatchObject({ inUse: false, saved: false });
  });

  it('returns an empty list when nmcli is missing (ENOENT)', async () => {
    mockNmcli.mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOENT' }));
    const res = await runScan('wlan1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns an empty list on a generic listing error', async () => {
    mockNmcli.mockRejectedValue(new Error('interface not found'));
    const res = await runScan('wlan2');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
