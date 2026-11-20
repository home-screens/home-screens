import { describe, it, expect } from 'vitest';
import { heartbeatPill, IDLE_WITHIN_MS, ONLINE_WITHIN_MS } from '../display-liveness';

const NOW = 1_700_000_000_000;

describe('heartbeatPill', () => {
  it('follows the three heartbeat states', () => {
    expect(heartbeatPill(NOW - 1_000, NOW).kind).toBe('online');
    expect(heartbeatPill(NOW - ONLINE_WITHIN_MS, NOW).kind).toBe('idle');
    expect(heartbeatPill(NOW - IDLE_WITHIN_MS, NOW).kind).toBe('offline');
  });

  it('gives a display never heard from its own kind, in the offline colours with no visible border', () => {
    for (const never of [null, undefined, 0]) {
      const pill = heartbeatPill(never, NOW);
      expect(pill.kind).toBe('never');
      expect(pill.pillClass).toMatch(/border-transparent/);
    }
    expect(heartbeatPill(NOW - IDLE_WITHIN_MS, NOW).pillClass).toMatch(/border-hs-border-strong/);
    expect(heartbeatPill(null, NOW).dotClass).toBe(heartbeatPill(NOW - IDLE_WITHIN_MS, NOW).dotClass);
  });
});
