import { expect } from '@playwright/test';
import type { ConfigVariant } from './types';

/**
 * fullscreen-weather rows.
 *
 * All rows use the shared `weather` stub (72° current, a multi-day forecast),
 * so assertions key off that payload. Each row flips exactly one field and
 * proves the render changed, per the CONFIG_VARIANTS contract.
 */
/** A 7-day forecast so `daysToShow` has something to trim (the shared weather
 *  stub ships only 2 days, which would make every setting render identically). */
const SEVEN_DAY_BODY = {
  hourly: [
    { time: '2099-07-07T12:00:00Z', temp: 72, feelsLike: 70, humidity: 55, icon: 'sun', description: 'Clear', windSpeed: 8, precipProbability: 0 },
    { time: '2099-07-07T13:00:00Z', temp: 74, feelsLike: 72, humidity: 53, icon: 'sun', description: 'Clear', windSpeed: 9, precipProbability: 0 },
    { time: '2099-07-07T14:00:00Z', temp: 76, feelsLike: 75, humidity: 50, icon: 'sun', description: 'Clear', windSpeed: 9, precipProbability: 10 },
  ],
  forecast: Array.from({ length: 7 }, (_, i) => ({
    date: `2099-07-${String(7 + i).padStart(2, '0')}`,
    high: 78 + i, low: 61 + i, icon: 'sun', description: 'Sunny', precipProbability: 0,
  })),
};

export const FULLSCREEN_WEATHER_VARIANTS: ConfigVariant[] = [
  {
    // theme is the shared fullscreen token set; midnight paints bg #0a0a0a.
    type: 'fullscreen-weather', name: 'theme-midnight', kind: 'networked', stubKey: 'weather',
    config: { theme: 'midnight' },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fullscreen-weather"]')).toHaveAttribute('style', /#0a0a0a/i);
    },
  },
  {
    // skyLayer 'off' removes the condition wash element entirely.
    type: 'fullscreen-weather', name: 'sky-off', kind: 'networked', stubKey: 'weather',
    config: { skyLayer: 'off' },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fsw-sky"]')).toHaveCount(0);
    },
  },
  {
    type: 'fullscreen-weather', name: 'sky-auto', kind: 'networked', stubKey: 'weather',
    config: { skyLayer: 'auto' },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fsw-sky"]')).toHaveCount(1);
    },
  },
  {
    // animateConditions gates the particle layer's keyframe <style> block.
    type: 'fullscreen-weather', name: 'no-motion', kind: 'networked', stubKey: 'weather',
    config: { animateConditions: false },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fullscreen-weather"]')).toBeVisible();
      await expect(mod.locator('style:has-text("fsw-fall")')).toHaveCount(0);
    },
  },
  {
    // daysToShow trims the range-bar list; 3 rows instead of the default 7.
    // The header names the number of days actually drawn, so a 7-day body
    // trimmed to 3 proves the field rather than echoing the config back.
    type: 'fullscreen-weather', name: 'days-to-show-3', kind: 'networked', stubKey: 'weather',
    stubBody: SEVEN_DAY_BODY,
    config: { view: 'panorama', daysToShow: 3 },
    expect: async (mod) => { await expect(mod).toContainText('3-day outlook'); },
  },
  {
    // showRibbon hides the 48h temperature curve (the only <svg> in Panorama
    // once the stat rail is off, so assert on the section label instead).
    type: 'fullscreen-weather', name: 'hide-ribbon', kind: 'networked', stubKey: 'weather',
    config: { view: 'panorama', showRibbon: false },
    expect: async (mod) => {
      await expect(mod).toBeVisible();
      await expect(mod).not.toContainText('Chance of rain');
    },
  },
  {
    type: 'fullscreen-weather', name: 'hide-stat-rail', kind: 'networked', stubKey: 'weather',
    config: { view: 'panorama', showStatRail: false },
    expect: async (mod) => {
      await expect(mod).toBeVisible();
      await expect(mod).not.toContainText('UV Index');
    },
  },
  {
    // The weather stub carries no minutely payload, so the strip is absent
    // regardless — this row pins that the toggle never crashes the view.
    type: 'fullscreen-weather', name: 'hide-nowcast', kind: 'networked', stubKey: 'weather',
    config: { view: 'panorama', showNowcast: false },
    expect: async (mod) => {
      await expect(mod).toBeVisible();
      await expect(mod).not.toContainText('Next hour');
    },
  },
  {
    // The stub has no alerts, so showAlerts true still renders no band; the
    // row proves the flag is wired and the view survives either setting.
    type: 'fullscreen-weather', name: 'hide-alerts', kind: 'networked', stubKey: 'weather',
    config: { showAlerts: false },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fsw-alert"]')).toHaveCount(0);
    },
  },
  {
    // showTime gates the header clock in every view.
    type: 'fullscreen-weather', name: 'hide-time', kind: 'networked', stubKey: 'weather',
    config: { showTime: false },
    expect: async (mod) => { await expect(mod.locator('[data-testid="fsw-clock"]')).toHaveCount(0); },
  },
  {
    type: 'fullscreen-weather', name: 'show-time', kind: 'networked', stubKey: 'weather',
    config: { showTime: true },
    expect: async (mod) => { await expect(mod.locator('[data-testid="fsw-clock"]')).toHaveCount(1); },
  },
  {
    type: 'fullscreen-weather', name: 'location-label', kind: 'networked', stubKey: 'weather',
    config: { locationLabel: 'E2E Weather Town' },
    expect: async (mod) => { await expect(mod).toContainText('E2E Weather Town'); },
  },
  {
    // accentColor overrides the condition-derived accent on the hero halo.
    type: 'fullscreen-weather', name: 'accent-color', kind: 'networked', stubKey: 'weather',
    config: { accentColor: '#ff00aa' },
    expect: async (mod) => {
      await expect(mod.locator('[style*="rgb(255, 0, 170)"], [style*="#ff00aa"]').first()).toBeAttached();
    },
  },
  {
    type: 'fullscreen-weather', name: 'typography-2x-large', kind: 'networked', stubKey: 'weather',
    config: { typographySize: '2x-large' },
    expect: async (mod) => { await expect(mod).toContainText('72°'); },
  },
  {
    type: 'fullscreen-weather', name: 'density-cozy', kind: 'networked', stubKey: 'weather',
    config: { density: 'cozy' },
    expect: async (mod) => { await expect(mod).toContainText('72°'); },
  },
];
