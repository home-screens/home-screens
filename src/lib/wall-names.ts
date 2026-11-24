/**
 * What to call a wall's browser in a list a grown-up reads: "Raspberry Pi",
 * "Safari on an iPhone", "Chrome on an Android tablet". Worked out from the
 * browser's own description of itself, which is all the hub has, so it is a
 * hint for telling a kitchen Pi from a phone and never proof of either.
 *
 * Pure. The words come from the caller's dictionary (`wallNames.*`), so the
 * editor and the phone say the same thing.
 */
import type { TranslateFn } from '@/i18n/types';

export type WallDevice = 'pi' | 'iphone' | 'ipad' | 'androidPhone' | 'androidTablet' | 'mac' | 'windows' | 'chromebook' | 'linux' | 'unknown';

export interface WallBrowserGuess {
  device: WallDevice;
  /** A browser's own name, which is the same in every language. Null when it cannot be told. */
  browser: string | null;
}

export function guessWallBrowser(userAgent: string): WallBrowserGuess {
  const ua = userAgent;
  let device: WallDevice = 'unknown';
  if (/iPhone|iPod/.test(ua)) device = 'iphone';
  else if (/iPad/.test(ua)) device = 'ipad';
  else if (/Android/.test(ua)) device = /Mobile/.test(ua) ? 'androidPhone' : 'androidTablet';
  else if (/CrOS/.test(ua)) device = 'chromebook';
  else if (/Linux (aarch64|armv\d+l?)/.test(ua)) device = 'pi';
  else if (/Macintosh|Mac OS X/.test(ua)) device = 'mac';
  else if (/Windows/.test(ua)) device = 'windows';
  else if (/Linux|X11/.test(ua)) device = 'linux';

  let browser: string | null = null;
  if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = 'Firefox';
  else if (/SamsungBrowser\//.test(ua)) browser = 'Samsung Internet';
  else if (/Chromium\//.test(ua)) browser = 'Chromium';
  else if (/Chrome\/|CriOS\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  return { device, browser };
}

/**
 * The name shown for a wall. `t` reads the namespace that holds
 * `wallNames.*`. A Raspberry Pi is named as that alone: every one of them
 * runs the same browser, and naming it would only make the row longer.
 */
export function wallBrowserName(t: TranslateFn, wall: { userAgent: string; hubScreen?: boolean }): string {
  if (wall.hubScreen) return t('wallNames.hubScreen');
  const { device, browser } = guessWallBrowser(wall.userAgent);
  // A product's own name, the same in every language.
  if (device === 'pi') return 'Raspberry Pi';
  if (device === 'unknown') return browser ?? t('wallNames.someBrowser');
  const deviceName = t(`wallNames.device.${device}`);
  return browser ? t('wallNames.browserOn', { browser, device: deviceName }) : t('wallNames.justDevice', { device: deviceName });
}
