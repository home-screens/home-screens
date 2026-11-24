import { describe, it, expect } from 'vitest';
import { guessWallBrowser, wallBrowserName } from '../wall-names';
import en from '@/translations/en-US/core.json';
import type { TranslateFn } from '@/i18n/types';

const t: TranslateFn = (key, params) => {
  const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en);
  return String(value).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ''));
};

const UA = {
  pi: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  linuxDesktop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
};

describe('wallBrowserName', () => {
  it('names the hub\'s own screen as that, whatever its browser says', () => {
    expect(wallBrowserName(t, { userAgent: UA.pi, hubScreen: true })).toBe("This Home Screens' own screen");
  });

  it('calls a Pi a Raspberry Pi and leaves its browser out', () => {
    expect(wallBrowserName(t, { userAgent: UA.pi })).toBe('Raspberry Pi');
  });

  it('tells a phone, a tablet and a computer apart, which is what a grown-up needs to see', () => {
    expect(wallBrowserName(t, { userAgent: UA.iphone })).toBe('Safari on an iPhone');
    expect(wallBrowserName(t, { userAgent: UA.ipad })).toBe('Safari on an iPad');
    expect(wallBrowserName(t, { userAgent: UA.androidTablet })).toBe('Chrome on an Android tablet');
    expect(wallBrowserName(t, { userAgent: UA.androidPhone })).toBe('Chrome on an Android phone');
    expect(wallBrowserName(t, { userAgent: UA.macFirefox })).toBe('Firefox on a Mac');
    expect(wallBrowserName(t, { userAgent: UA.windowsEdge })).toBe('Edge on a Windows PC');
    expect(wallBrowserName(t, { userAgent: UA.linuxDesktop })).toBe('Chrome on a Linux computer');
  });

  it('says something plain for a caller that is not a browser at all', () => {
    expect(wallBrowserName(t, { userAgent: 'curl/8.7.1' })).toBe('A browser');
    expect(wallBrowserName(t, { userAgent: '' })).toBe('A browser');
  });

  it('does not take an Android tablet for a Pi', () => {
    expect(guessWallBrowser(UA.androidTablet).device).toBe('androidTablet');
    expect(guessWallBrowser('Mozilla/5.0 (Linux; Android 13; aarch64) Chrome/125 Safari/537.36').device).toBe('androidTablet');
  });
});
