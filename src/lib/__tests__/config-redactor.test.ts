import { describe, it, expect } from 'vitest';
import { redactConfig, REDACTED } from '@/lib/config-redactor';
import type { ScreenConfiguration } from '@/types/config';

function baseConfig(): ScreenConfiguration {
  return {
    version: 1,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080, displayHeight: 1920, displayTransform: '90',
      latitude: 44.71, longitude: -93.42,
      weather: { provider: 'weatherapi', latitude: 44.71, longitude: -93.42, units: 'imperial' },
      calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 },
    },
    screens: [],
  };
}

describe('redactConfig', () => {
  it('returns a deep clone — never mutates the input', () => {
    const cfg = baseConfig();
    cfg.screens.push({
      id: 's1',
      name: 'Screen 1',
      backgroundImage: '',
      modules: [
        { id: 'm1', type: 'calendar', x: 0, y: 0, width: 4, height: 4,
          style: {} as never,
          config: {
            icalSources: [{ id: 'x', type: 'ical', name: 'work', url: 'https://cal.example/secret?token=ABC' }],
            googleCalendarId: '', googleCalendarIds: [],
          } as never,
        } as never,
      ],
    });
    const snapshot = JSON.stringify(cfg);
    redactConfig(cfg);
    expect(JSON.stringify(cfg)).toBe(snapshot);
  });

  it('redacts calendar ICS source urls', () => {
    const cfg = baseConfig();
    cfg.screens.push({
      id: 's1', name: 's1', backgroundImage: '',
      modules: [
        { id: 'm1', type: 'calendar', x: 0, y: 0, width: 4, height: 4,
          style: {} as never,
          config: {
            icalSources: [{ id: 'x', type: 'ical', name: 'work', url: 'https://cal.example/private?token=ABC' }],
            googleCalendarId: '', googleCalendarIds: [],
          } as never,
        } as never,
      ],
    });
    const redacted = redactConfig(cfg);
    const mod = redacted.screens[0].modules[0] as unknown as { config: { icalSources: Array<{ url: string }> } };
    expect(mod.config.icalSources[0].url).toBe(REDACTED);
  });

  it('redacts iframe module url field (may contain auth tokens)', () => {
    const cfg = baseConfig();
    cfg.screens.push({
      id: 's1', name: 's1', backgroundImage: '',
      modules: [
        { id: 'm1', type: 'iframe', x: 0, y: 0, width: 4, height: 4,
          style: {} as never,
          config: { url: 'https://internal.example.com/?key=SECRET' } as never,
        } as never,
      ],
    });
    const redacted = redactConfig(cfg);
    const mod = redacted.screens[0].modules[0] as unknown as { config: { url: string } };
    expect(mod.config.url).toBe(REDACTED);
  });

  it('does NOT redact known public, non-sensitive fields', () => {
    const cfg = baseConfig();
    cfg.settings.latitude = 44.71;
    cfg.settings.longitude = -93.42;
    cfg.settings.rotationIntervalMs = 30000;
    const redacted = redactConfig(cfg);
    expect(redacted.settings.latitude).toBe(44.71);
    expect(redacted.settings.longitude).toBe(-93.42);
    expect(redacted.settings.rotationIntervalMs).toBe(30000);
  });

  it('scrubs any string value that equals a known-secret value (resolved plugin secrets)', () => {
    const cfg = baseConfig();
    cfg.screens.push({
      id: 's1', name: 's1', backgroundImage: '',
      modules: [
        { id: 'm1', type: 'weather', x: 0, y: 0, width: 4, height: 4,
          style: {} as never,
          config: { apiKeyRef: 'openweathermap_key', manualKey: 'SK_LIVE_ABCDEF' } as never,
        } as never,
      ],
    });
    const redacted = redactConfig(cfg, { knownSecretValues: ['SK_LIVE_ABCDEF'] });
    const mod = redacted.screens[0].modules[0] as unknown as { config: { apiKeyRef: string; manualKey: string } };
    expect(mod.config.apiKeyRef).toBe('openweathermap_key'); // reference kept as signal
    expect(mod.config.manualKey).toBe(REDACTED);             // resolved value scrubbed
  });

  it('defaults unknown string keys that end in "Url" or "Token" or "Key" to redacted', () => {
    const cfg = baseConfig();
    cfg.screens.push({
      id: 's1', name: 's1', backgroundImage: '',
      modules: [
        { id: 'm1', type: 'iframe' as never, x: 0, y: 0, width: 4, height: 4,
          style: {} as never,
          config: {
            widgetUrl: 'https://hook.example.com?token=abc',
            authToken: 'bearer-ABC',
            apiKey: 'K_ABC',
            foo: 'plain string',
          } as never,
        } as never,
      ],
    });
    const redacted = redactConfig(cfg);
    const cfg2 = (redacted.screens[0].modules[0] as { config: Record<string, unknown> }).config;
    expect(cfg2.widgetUrl).toBe(REDACTED);
    expect(cfg2.authToken).toBe(REDACTED);
    expect(cfg2.apiKey).toBe(REDACTED);
    expect(cfg2.foo).toBe('plain string');
  });

  it('redacts an auth block under settings if present', () => {
    const cfg = baseConfig();
    (cfg.settings as unknown as { auth?: { enabled: boolean; customDomain: string; oauthClientId: string } }).auth = {
      enabled: true, customDomain: 'home.example.com', oauthClientId: 'SECRET-ID',
    };
    const redacted = redactConfig(cfg);
    const auth = (redacted.settings as unknown as { auth: Record<string, unknown> }).auth;
    expect(auth.enabled).toBe(true);
    expect(auth.customDomain).toBe(REDACTED);
    expect(auth.oauthClientId).toBe(REDACTED);
  });
});
