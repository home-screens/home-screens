import { describe, it, expect } from 'vitest';
import {
  validateHardwareStats,
  validateBrowserStats,
  type HardwareStats,
  type BrowserStats,
} from '@/lib/hardware-stats';

describe('validateHardwareStats', () => {
  it('accepts a minimal-but-valid payload', () => {
    const payload: HardwareStats = {
      piModel: 'Raspberry Pi 4 Model B Rev 1.4',
      cpuModel: 'ARMv8 Processor rev 3 (v8l)',
      cpuCores: 4,
      cpuTempC: 52.3,
      load1: 0.12,
      load5: 0.08,
      load15: 0.05,
      throttled: { raw: '0x0', active: false, underVoltage: false, previouslyThrottled: false },
      memoryTotal: 4_000_000_000,
      memoryFree: 2_000_000_000,
      diskTotal: 32_000_000_000,
      diskFree: 20_000_000_000,
      reportedAt: '2026-04-17T12:00:00.000Z',
    };
    expect(validateHardwareStats(payload)).toEqual(payload);
  });

  it('returns null when required numeric fields are missing', () => {
    expect(validateHardwareStats({ cpuCores: 'four' })).toBeNull();
    expect(validateHardwareStats(null)).toBeNull();
    expect(validateHardwareStats(undefined)).toBeNull();
  });

  it('allows optional fields to be null (non-Pi Linux or missing sensors)', () => {
    const payload = {
      piModel: null,
      cpuModel: null,
      cpuCores: 8,
      cpuTempC: null,
      load1: 0.5,
      load5: 0.4,
      load15: 0.3,
      throttled: null,
      memoryTotal: 17_000_000_000,
      memoryFree: 3_000_000_000,
      diskTotal: 500_000_000_000,
      diskFree: 100_000_000_000,
      reportedAt: new Date().toISOString(),
    };
    expect(validateHardwareStats(payload)).toEqual(payload);
  });

  it('rejects payloads with non-finite numbers (NaN/Infinity from broken sensors)', () => {
    const bad = {
      piModel: null, cpuModel: null, cpuCores: Number.NaN,
      cpuTempC: null, load1: 0, load5: 0, load15: 0, throttled: null,
      memoryTotal: 0, memoryFree: 0, diskTotal: 0, diskFree: 0,
      reportedAt: new Date().toISOString(),
    };
    expect(validateHardwareStats(bad)).toBeNull();
  });

  it('rejects payloads where reportedAt is not an ISO string', () => {
    const bad = {
      piModel: null, cpuModel: null, cpuCores: 4,
      cpuTempC: null, load1: 0, load5: 0, load15: 0, throttled: null,
      memoryTotal: 0, memoryFree: 0, diskTotal: 0, diskFree: 0,
      reportedAt: 12345,
    };
    expect(validateHardwareStats(bad)).toBeNull();
  });
});

describe('validateBrowserStats', () => {
  it('accepts a fully-populated browser payload', () => {
    const payload: BrowserStats = {
      userAgent: 'Mozilla/5.0 ... Chrome/131.0.0.0 Safari/537.36',
      chromiumVersion: '131.0.0.0',
      viewportWidth: 1080,
      viewportHeight: 1920,
      devicePixelRatio: 2,
      hardwareConcurrency: 4,
      deviceMemory: 4,
      webglRenderer: 'Mesa V3D 7.1.7',
      reportedAt: '2026-04-17T12:00:00.000Z',
    };
    expect(validateBrowserStats(payload)).toEqual(payload);
  });

  it('tolerates null for fields the browser may not expose', () => {
    const payload = {
      userAgent: 'Mozilla/5.0',
      chromiumVersion: null,
      viewportWidth: 1920,
      viewportHeight: 1080,
      devicePixelRatio: 1,
      hardwareConcurrency: null,
      deviceMemory: null,
      webglRenderer: null,
      reportedAt: new Date().toISOString(),
    };
    expect(validateBrowserStats(payload)).toEqual(payload);
  });

  it('rejects non-positive viewport dimensions', () => {
    const bad = {
      userAgent: 'x', chromiumVersion: null,
      viewportWidth: 0, viewportHeight: 1080,
      devicePixelRatio: 1, hardwareConcurrency: null,
      deviceMemory: null, webglRenderer: null,
      reportedAt: new Date().toISOString(),
    };
    expect(validateBrowserStats(bad)).toBeNull();
  });

  it('truncates a pathologically long userAgent to 1 KB', () => {
    const hugeUA = 'x'.repeat(5000);
    const validated = validateBrowserStats({
      userAgent: hugeUA, chromiumVersion: null,
      viewportWidth: 100, viewportHeight: 100,
      devicePixelRatio: 1, hardwareConcurrency: null,
      deviceMemory: null, webglRenderer: null,
      reportedAt: new Date().toISOString(),
    });
    expect(validated?.userAgent.length).toBe(1024);
  });
});
