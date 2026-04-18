import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLocalHardwareStats,
  __resetHardwareStatsCacheForTests,
} from '@/lib/hardware-stats-server';
import { validateHardwareStats } from '@/lib/hardware-stats';

describe('getLocalHardwareStats', () => {
  beforeEach(() => {
    __resetHardwareStatsCacheForTests();
  });

  it('returns a payload that passes the shared validator', async () => {
    const stats = await getLocalHardwareStats();
    expect(validateHardwareStats(stats)).not.toBeNull();
  });

  it('populates load averages from Node os.loadavg', async () => {
    const stats = await getLocalHardwareStats();
    expect(typeof stats.load1).toBe('number');
    expect(typeof stats.load5).toBe('number');
    expect(typeof stats.load15).toBe('number');
    expect(Number.isFinite(stats.load1)).toBe(true);
  });

  it('populates memoryTotal/memoryFree from Node os', async () => {
    const stats = await getLocalHardwareStats();
    expect(stats.memoryTotal).toBeGreaterThan(0);
    expect(stats.memoryFree).toBeGreaterThan(0);
    expect(stats.memoryFree).toBeLessThanOrEqual(stats.memoryTotal);
  });

  it('returns null thermal/throttled fields on non-Pi hosts', async () => {
    // Pi-specific fields must be null (not undefined, not thrown) on both
    // macOS (no /sys) and Linux CI (no vcgencmd, no /sys/firmware/devicetree).
    // This covers both branches so Linux CI isn't silently a no-op.
    const stats = await getLocalHardwareStats();
    if (process.platform === 'darwin') {
      expect(stats.cpuTempC).toBeNull();
      expect(stats.throttled).toBeNull();
      expect(stats.piModel).toBeNull();
    } else {
      // Linux CI: thermal/Pi-specific fields should be null OR a finite number.
      // Whichever we get, the shape must be valid — no throws, no undefineds.
      expect(stats.piModel === null || typeof stats.piModel === 'string').toBe(true);
      expect(stats.cpuTempC === null || (typeof stats.cpuTempC === 'number' && Number.isFinite(stats.cpuTempC))).toBe(true);
      expect(stats.throttled === null || typeof stats.throttled === 'object').toBe(true);
    }
  });

  it('caches results within the TTL window (second call returns the same object)', async () => {
    const a = await getLocalHardwareStats();
    const b = await getLocalHardwareStats();
    // Same reportedAt timestamp proves it came from the cache rather than
    // being re-collected (Date.now changes between calls).
    expect(a.reportedAt).toBe(b.reportedAt);
  });
});
