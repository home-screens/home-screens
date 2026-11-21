/**
 * Migration 016: the full-screen weather cards became one ordered list.
 *
 * The Forecast and Conditions views used to carry one on/off toggle per
 * card (`showWind`, `showMoon`, ... `showPressure`) and draw the cards that
 * were on in an order fixed per view. They now read `cards`: the cards that
 * are on, in the order they show.
 *
 * Each module's list is built so its wall looks the same after the
 * migration as before: the Conditions page's old order for a Conditions
 * module, the Forecast page's for a Forecast module (wind and sunrise
 * first, so the same two cards sit under the map), and the default order
 * for every other view, which never drew the cards. A card whose toggle was
 * off is left off the list. The ten toggles are removed.
 *
 * `showNowcast` stays: Panorama and Wide strip still read it for their
 * minute-by-minute strip. It also decided whether the nowcast card was on,
 * so it decides the card's place on the list here.
 */

import type { ScreenConfiguration, FullscreenWeatherCard } from '@/types/config';
import { DEFAULT_FULLSCREEN_WEATHER_CARDS } from '@/lib/fullscreen-weather-cards';
import { mapConfigModules } from '@/lib/config-modules';

/** The Conditions page's order before the list: air quality on top, wind and sunrise last. */
const CONDITIONS_ORDER: readonly FullscreenWeatherCard[] = [
  'airQuality', 'moon', 'uv', 'feelsLike', 'precipitation', 'visibility', 'humidity', 'pressure', 'nowcast', 'wind', 'sun',
];
/** The Forecast page's order before the list: wind and sunrise under the map. */
const FORECAST_ORDER: readonly FullscreenWeatherCard[] = [
  'wind', 'sun', 'moon', 'uv', 'feelsLike', 'precipitation', 'visibility', 'humidity', 'pressure', 'airQuality', 'nowcast',
];

const TOGGLE_FOR: Record<FullscreenWeatherCard, string> = {
  wind: 'showWind', sun: 'showSun', moon: 'showMoon', uv: 'showUV', feelsLike: 'showFeelsLike', humidity: 'showHumidity',
  precipitation: 'showPrecipitation', visibility: 'showVisibility', pressure: 'showPressure', nowcast: 'showNowcast', airQuality: 'showAirQuality',
};
const REMOVED = Object.values(TOGGLE_FOR).filter((key) => key !== 'showNowcast');

export const v15ToV16 = {
  version: 16,
  description: 'Full-screen weather cards: ten toggles folded into one ordered list',
  up: (config: ScreenConfiguration): ScreenConfiguration => {
    const modules = mapConfigModules(config, (mod) => {
      if (mod.type !== 'fullscreen-weather' || !mod.config) return mod;
      const cfg = mod.config as Record<string, unknown>;
      if (Array.isArray(cfg.cards)) return mod;
      const base = cfg.view === 'conditions' ? CONDITIONS_ORDER
        : cfg.view === 'forecast' ? FORECAST_ORDER
          : DEFAULT_FULLSCREEN_WEATHER_CARDS;
      const cards = base.filter((card) => cfg[TOGGLE_FOR[card]] !== false);
      const rest = Object.fromEntries(Object.entries(cfg).filter(([key]) => !REMOVED.includes(key)));
      return { ...mod, config: { ...rest, cards } as typeof mod.config };
    });
    return { ...config, ...modules, version: 16 };
  },
};
