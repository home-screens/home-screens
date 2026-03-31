import { describe, it, expect, beforeEach } from 'vitest';
import { getHostSettings, setHostSettings } from '../plugin-host-settings';
import type { HostSettings } from '../plugin-host-settings';

describe('plugin-host-settings', () => {
  const customSettings: HostSettings = {
    timezone: 'America/New_York',
    units: 'metric',
    latitude: 40.7128,
    longitude: -74.006,
    displayWidth: 1920,
    displayHeight: 1080,
    appVersion: '1.0.0',
  };

  beforeEach(() => {
    // Reset to defaults by setting known state
    setHostSettings({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      units: 'imperial',
      latitude: null,
      longitude: null,
      displayWidth: 1080,
      displayHeight: 1920,
      appVersion: '',
    });
  });

  it('returns default settings initially', () => {
    const settings = getHostSettings();
    expect(settings.units).toBe('imperial');
    expect(settings.latitude).toBeNull();
    expect(settings.longitude).toBeNull();
  });

  it('returns updated settings after setHostSettings', () => {
    setHostSettings(customSettings);
    const settings = getHostSettings();
    expect(settings.timezone).toBe('America/New_York');
    expect(settings.units).toBe('metric');
    expect(settings.latitude).toBe(40.7128);
    expect(settings.longitude).toBe(-74.006);
    expect(settings.displayWidth).toBe(1920);
    expect(settings.displayHeight).toBe(1080);
    expect(settings.appVersion).toBe('1.0.0');
  });

  it('returns a shallow copy, not the internal reference', () => {
    setHostSettings(customSettings);
    const a = getHostSettings();
    const b = getHostSettings();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('mutations to returned object do not affect internal state', () => {
    setHostSettings(customSettings);
    const settings = getHostSettings();
    settings.units = 'imperial';
    settings.latitude = 0;

    const fresh = getHostSettings();
    expect(fresh.units).toBe('metric');
    expect(fresh.latitude).toBe(40.7128);
  });
});
