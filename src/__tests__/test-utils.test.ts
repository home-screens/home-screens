import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '@/lib/config';
import { getLatestSchemaVersion } from '@/lib/migrations';
import {
  jsonRequest,
  makeLocalStorage,
  makeTestConfig,
  makeTestModule,
  makeTestScreen,
  makeTestSettings,
} from '@/test-utils';

describe('makeTestSettings', () => {
  it('matches what a fresh install starts with', () => {
    expect(makeTestSettings()).toEqual(DEFAULT_CONFIG.settings);
  });

  it('lets an override win and leaves the rest alone', () => {
    const settings = makeTestSettings({ rotationIntervalMs: 1000, timezone: 'UTC' });
    expect(settings.rotationIntervalMs).toBe(1000);
    expect(settings.timezone).toBe('UTC');
    expect(settings.displayWidth).toBe(1080);
  });

  it('leaves optional fields unset', () => {
    const settings = makeTestSettings();
    expect('timezone' in settings).toBe(false);
    expect('sleep' in settings).toBe(false);
    expect('activeProfile' in settings).toBe(false);
  });

  it('hands out a fresh object every time', () => {
    makeTestSettings().calendar.googleCalendarIds.push('leaked');
    expect(makeTestSettings().calendar.googleCalendarIds).toEqual([]);
  });
});

describe('makeTestConfig', () => {
  it('is on the latest schema with the fresh-install shape', () => {
    expect(makeTestConfig().version).toBe(getLatestSchemaVersion());
    expect(makeTestConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('builds an older config when asked', () => {
    expect(makeTestConfig({ version: 3 }).version).toBe(3);
  });

  it('takes its own settings and screens', () => {
    const config = makeTestConfig({
      settings: makeTestSettings({ latitude: 40 }),
      screens: [makeTestScreen('home')],
    });
    expect(config.settings.latitude).toBe(40);
    expect(config.screens.map((s) => s.id)).toEqual(['home']);
  });
});

describe('makeTestScreen and makeTestModule', () => {
  it('names a screen after its id and starts it empty', () => {
    expect(makeTestScreen('home')).toEqual({ id: 'home', name: 'home', backgroundImage: '', modules: [] });
  });

  it('carries modules and extra fields', () => {
    const clock = makeTestModule('clock', { id: 'c1' });
    const screen = makeTestScreen('home', [clock], { enabled: false, name: 'Home' });
    expect(screen.modules).toEqual([clock]);
    expect(screen.enabled).toBe(false);
    expect(screen.name).toBe('Home');
  });

  it('builds a module with a box and a style, and a new id each time', () => {
    const a = makeTestModule('clock');
    const b = makeTestModule('clock');
    expect(a.type).toBe('clock');
    expect(a.id).not.toBe(b.id);
    expect(a.size).toEqual({ w: 100, h: 100 });
    expect(a.style.opacity).toBe(1);
    expect(a.style).not.toBe(b.style);
  });

  it('lets a module override win', () => {
    const mod = makeTestModule('text', { id: 'note', config: { text: 'hi' }, enabled: false });
    expect(mod).toMatchObject({ id: 'note', type: 'text', config: { text: 'hi' }, enabled: false });
  });
});

describe('jsonRequest', () => {
  it('is a plain GET without a body', () => {
    const req = jsonRequest('/api/thing?x=1');
    expect(req.method).toBe('GET');
    expect(req.nextUrl.pathname).toBe('/api/thing');
    expect(req.nextUrl.searchParams.get('x')).toBe('1');
    expect(req.headers.get('content-type')).toBeNull();
  });

  it('posts a body as JSON', async () => {
    const req = jsonRequest('http://hub.local/api/thing', { body: { a: 1 } });
    expect(req.method).toBe('POST');
    expect(req.nextUrl.host).toBe('hub.local');
    expect(req.headers.get('content-type')).toBe('application/json');
    expect(await req.json()).toEqual({ a: 1 });
  });

  it('keeps the given method and headers', async () => {
    const req = jsonRequest('/api/thing', { method: 'PUT', body: null, headers: { 'X-Rev': '7' } });
    expect(req.method).toBe('PUT');
    expect(req.headers.get('x-rev')).toBe('7');
    expect(await req.json()).toBeNull();
  });
});

describe('makeLocalStorage', () => {
  it('behaves like browser storage', () => {
    const storage = makeLocalStorage();
    expect(storage.getItem('missing')).toBeNull();
    expect(storage.length).toBe(0);

    storage.setItem('a', '1');
    storage.setItem('b', '');
    expect(storage.getItem('a')).toBe('1');
    expect(storage.getItem('b')).toBe('');
    expect(storage.length).toBe(2);
    expect(storage.key(0)).toBe('a');
    expect(storage.key(5)).toBeNull();

    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();
    expect(storage.length).toBe(1);

    storage.clear();
    expect(storage.length).toBe(0);
    expect(storage.key(0)).toBeNull();
  });

  it('keeps values as strings and separate between instances', () => {
    const one = makeLocalStorage();
    const two = makeLocalStorage();
    one.setItem('n', 5 as unknown as string);
    expect(one.getItem('n')).toBe('5');
    expect(two.getItem('n')).toBeNull();
  });
});
