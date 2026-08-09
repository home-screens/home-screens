import { expect } from '@playwright/test';
import type { ConfigVariant } from './types';
import { has, lacks, child, count } from './shared';

/**
 * Phase-1 batch rows for the WEATHER, AIR-QUALITY, and RAIN-MAP modules —
 * see .claude/plans/2026-07-09-e2e-100-percent-coverage.md.
 *
 * The default matrix serves matrixSettings() with imperial units, so weather
 * distance/pressure stats surface as ` mi`/` hPa` unless a row overrides units.
 *
 * Every rain-map row sets allowsExternal: true — the module loads basemap and
 * radar tiles from CDNs unconditionally, independent of the field being flipped.
 * The radar tile URL encodes several config fields as path segments
 * (`.../{size}/{radarZoom}/{x}/{y}/{colorScheme}/{smooth}_{snow}.png`), so those
 * flips are asserted against the img `src` even though the tile itself never loads.
 */

/** Weather body carrying station-observation fields (pressure/visibility/dewPoint) on the current hour. */
const WEATHER_STATION = {
  hourly: [
    { time: '2099-07-07T12:00:00Z', temp: 72, feelsLike: 70, humidity: 55, icon: 'clear-day', description: 'Clear', windSpeed: 8, precipProbability: 10, pressure: 1013, visibility: 10, dewPoint: 55 },
  ],
  forecast: [{ date: '2099-07-07', high: 78, low: 61, icon: 'clear-day', description: 'Sunny' }],
};

/** Weather body with precipAmount on the forecast days so showPrecipAmount can render an amount. */
const WEATHER_PRECIP_AMOUNT = {
  hourly: [
    { time: '2099-07-07T12:00:00Z', temp: 72, feelsLike: 70, humidity: 55, icon: 'clear-day', description: 'Clear', windSpeed: 8, precipProbability: 10 },
  ],
  forecast: [
    { date: '2099-07-07', high: 78, low: 61, icon: 'clear-day', description: 'Sunny', precipAmount: 0.5 },
    { date: '2099-07-08', high: 80, low: 63, icon: 'partly-cloudy-day', description: 'Partly cloudy', precipAmount: 0.3 },
  ],
};

/** Four hourly entries with distinct temps so an hoursToShow cap can drop the tail. */
const WEATHER_HOURLY_4 = {
  hourly: [
    { time: '2099-07-07T12:00:00Z', temp: 72, feelsLike: 70, humidity: 55, icon: 'clear-day', description: 'Clear', windSpeed: 8, precipProbability: 10 },
    { time: '2099-07-07T13:00:00Z', temp: 74, feelsLike: 72, humidity: 52, icon: 'clear-day', description: 'Clear', windSpeed: 9, precipProbability: 5 },
    { time: '2099-07-07T14:00:00Z', temp: 90, feelsLike: 88, humidity: 50, icon: 'clear-day', description: 'Hot', windSpeed: 10, precipProbability: 0 },
    { time: '2099-07-07T15:00:00Z', temp: 91, feelsLike: 89, humidity: 48, icon: 'clear-day', description: 'Hot', windSpeed: 11, precipProbability: 0 },
  ],
  forecast: [{ date: '2099-07-07', high: 78, low: 61, icon: 'clear-day', description: 'Sunny' }],
};

export const WEATHER_ENVIRONMENT_VARIANTS: ConfigVariant[] = [
  // ================= WEATHER =================

  // showHighLow gates the "H:.. L:.." line in the compact view.
  {
    type: 'weather', name: 'hide-high-low', kind: 'networked', stubKey: 'weather',
    config: { view: 'compact', showHighLow: false },
    expect: lacks('Clear', 'H:'),
  },
  // showFeelsLike gates the "Feels like .." line in the current view.
  {
    type: 'weather', name: 'hide-feels-like', kind: 'networked', stubKey: 'weather',
    config: { view: 'current', showFeelsLike: false },
    expect: lacks('Clear', 'Feels'),
  },
  // showPrecipAmount renders a per-day precip total (inches) in the table view.
  {
    type: 'weather', name: 'precip-amount', kind: 'networked', stubKey: 'weather', stubBody: WEATHER_PRECIP_AMOUNT,
    config: { view: 'table', showPrecipAmount: true, daysToShow: 2 },
    expect: has('0.5"'),
  },
  // showPressure / showVisibility / showDewPoint each add a station stat to the
  // current view (unit is imperial in the matrix → " mi", plus " hPa" and "°").
  {
    type: 'weather', name: 'station-stats', kind: 'networked', stubKey: 'weather', stubBody: WEATHER_STATION,
    config: { view: 'current', showPressure: true, showVisibility: true, showDewPoint: true },
    expect: async (mod) => { await has('1013 hPa')(mod); await has('10 mi')(mod); await has('55°')(mod); },
  },
  // hoursToShow caps how many hourly entries the hourly view renders.
  {
    type: 'weather', name: 'hours-to-show', kind: 'networked', stubKey: 'weather', stubBody: WEATHER_HOURLY_4,
    config: { view: 'hourly', hoursToShow: 2 },
    expect: lacks('72°', '90°'),
  },
  // showLocation adds a place-name header above the view, sourced from
  // settings.locationName (matrixSettings has coordinates but no name).
  {
    type: 'weather', name: 'show-location', kind: 'networked', stubKey: 'weather',
    settings: { locationName: 'Prior Lake, MN' },
    config: { view: 'hourly', showLocation: true },
    expect: has('Prior Lake, MN'),
  },
  // locationLabel overrides the geocoded name in that header.
  {
    type: 'weather', name: 'location-label', kind: 'networked', stubKey: 'weather',
    settings: { locationName: 'Prior Lake, MN' },
    config: { view: 'hourly', showLocation: true, locationLabel: 'Cabin' },
    expect: lacks('Cabin', 'Prior Lake'),
  },

  // ================= AIR-QUALITY =================

  // showAQI:false drops the AQI index block while showPollutants keeps the bars.
  {
    type: 'air-quality', name: 'hide-aqi', kind: 'networked', stubKey: 'air-quality',
    config: { showAQI: false, showPollutants: true },
    expect: lacks('PM2.5', 'Air Quality Index'),
  },

  // ================= RAIN-MAP (loads external tiles regardless of config) =================

  // zoom feeds the {z} segment of the base map tile URL.
  {
    type: 'rain-map', name: 'zoom', kind: 'networked', stubKey: 'rain-map', allowsExternal: true,
    config: { zoom: 8 },
    expect: child('img[src*="dark_all/8/"]'),
  },
  // colorScheme is the radar tile URL color segment (default 2 → set 4).
  {
    type: 'rain-map', name: 'color-scheme', kind: 'networked', stubKey: 'rain-map', allowsExternal: true,
    config: { colorScheme: 4 },
    expect: child('img[src*="/4/1_1.png"]'),
  },
  // showSnow:false flips the snow segment of the radar tile URL (..._1 → ..._0).
  {
    type: 'rain-map', name: 'hide-snow', kind: 'networked', stubKey: 'rain-map', allowsExternal: true,
    config: { showSnow: false },
    expect: child('img[src*="1_0.png"]'),
  },
  // smooth:false flips the smoothing segment of the radar tile URL (1_.. → 0_..).
  {
    type: 'rain-map', name: 'no-smooth', kind: 'networked', stubKey: 'rain-map', allowsExternal: true,
    config: { smooth: false },
    expect: child('img[src*="0_1.png"]'),
  },
  // opacity is the computed opacity on the radar layer imgs (default 0.7).
  {
    type: 'rain-map', name: 'opacity', kind: 'networked', stubKey: 'rain-map', allowsExternal: true,
    config: { opacity: 0.35 },
    expect: async (mod) => {
      const img = mod.locator('img[src*="rainviewer"]').first();
      await expect(img).toBeAttached();
      const op = await img.evaluate((el) => getComputedStyle(el).opacity);
      expect(op).toBe('0.35');
    },
  },
  // showTimestamp toggles the font-mono timestamp overlay (default on).
  {
    type: 'rain-map', name: 'hide-timestamp', kind: 'networked', stubKey: 'rain-map', allowsExternal: true,
    config: { showTimestamp: false },
    expect: async (mod) => { await child('img[src*="cartocdn"]')(mod); await count('.font-mono', 0)(mod); },
  },
  // showTimeline toggles the animated timeline dots (default on, needs >1 frame).
  {
    type: 'rain-map', name: 'hide-timeline', kind: 'networked', stubKey: 'rain-map', allowsExternal: true,
    config: { showTimeline: false },
    expect: async (mod) => { await child('img[src*="cartocdn"]')(mod); await count('.rounded-full.transition-all', 0)(mod); },
  },
  // latitude/longitude recenter the tile grid; assert the base tile x/y for London.
  {
    type: 'rain-map', name: 'lat-lon', kind: 'networked', stubKey: 'rain-map', allowsExternal: true,
    config: { latitude: 51.5, longitude: -0.12 },
    expect: child('img[src*="dark_all/6/31/21"]'),
  },
];
