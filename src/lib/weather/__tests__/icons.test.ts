import { describe, it, expect } from 'vitest';
import {
  wmoCodeToIcon,
  weatherApiCodeToIcon,
  inferIconFromText,
  OWM_ICON_MAP,
  PIRATE_ICON_MAP,
  FALLBACK_ICON,
} from '../icons';

// ── wmoCodeToIcon (Open-Meteo WMO codes) ────────────────────────────

describe('wmoCodeToIcon', () => {
  it('maps code 0 to sun/moon based on isDay', () => {
    expect(wmoCodeToIcon(0, true)).toBe('sun');
    expect(wmoCodeToIcon(0, false)).toBe('moon');
  });

  it('maps codes 1-2 (mainly clear / partly cloudy) with day/night', () => {
    expect(wmoCodeToIcon(1, true)).toBe('cloud-sun');
    expect(wmoCodeToIcon(1, false)).toBe('cloud-moon');
    expect(wmoCodeToIcon(2, true)).toBe('cloud-sun');
    expect(wmoCodeToIcon(2, false)).toBe('cloud-moon');
  });

  it('maps code 3 (overcast) to cloud regardless of day/night', () => {
    expect(wmoCodeToIcon(3, true)).toBe('cloud');
    expect(wmoCodeToIcon(3, false)).toBe('cloud');
  });

  it('maps fog codes (45, 48) to cloud-fog', () => {
    expect(wmoCodeToIcon(45, true)).toBe('cloud-fog');
    expect(wmoCodeToIcon(48, false)).toBe('cloud-fog');
  });

  it('maps drizzle codes (51-57) to cloud-drizzle', () => {
    expect(wmoCodeToIcon(51, true)).toBe('cloud-drizzle');
    expect(wmoCodeToIcon(53, true)).toBe('cloud-drizzle');
    expect(wmoCodeToIcon(55, true)).toBe('cloud-drizzle');
    expect(wmoCodeToIcon(56, true)).toBe('cloud-drizzle');
    expect(wmoCodeToIcon(57, true)).toBe('cloud-drizzle');
  });

  it('maps rain codes (61-67) to cloud-rain', () => {
    expect(wmoCodeToIcon(61, true)).toBe('cloud-rain');
    expect(wmoCodeToIcon(63, true)).toBe('cloud-rain');
    expect(wmoCodeToIcon(65, true)).toBe('cloud-rain');
    expect(wmoCodeToIcon(66, false)).toBe('cloud-rain');
    expect(wmoCodeToIcon(67, false)).toBe('cloud-rain');
  });

  it('maps snow codes (71-77) to snowflake', () => {
    expect(wmoCodeToIcon(71, true)).toBe('snowflake');
    expect(wmoCodeToIcon(73, true)).toBe('snowflake');
    expect(wmoCodeToIcon(75, true)).toBe('snowflake');
    expect(wmoCodeToIcon(77, true)).toBe('snowflake');
  });

  it('maps rain shower codes (80-82) to cloud-rain', () => {
    expect(wmoCodeToIcon(80, true)).toBe('cloud-rain');
    expect(wmoCodeToIcon(81, true)).toBe('cloud-rain');
    expect(wmoCodeToIcon(82, true)).toBe('cloud-rain');
  });

  it('maps snow shower codes (85-86) to snowflake', () => {
    expect(wmoCodeToIcon(85, true)).toBe('snowflake');
    expect(wmoCodeToIcon(86, true)).toBe('snowflake');
  });

  it('maps thunderstorm codes (95-99) to cloud-lightning', () => {
    expect(wmoCodeToIcon(95, true)).toBe('cloud-lightning');
    expect(wmoCodeToIcon(96, true)).toBe('cloud-lightning');
    expect(wmoCodeToIcon(99, true)).toBe('cloud-lightning');
  });

  it('returns fallback for unrecognized codes', () => {
    expect(wmoCodeToIcon(100, true)).toBe(FALLBACK_ICON);
    expect(wmoCodeToIcon(10, true)).toBe(FALLBACK_ICON);
    expect(wmoCodeToIcon(44, true)).toBe(FALLBACK_ICON);
  });

  it('negative codes fall into the <= 2 branch (cloud-sun/cloud-moon)', () => {
    // code <= 2 is true for negative numbers — this is a quirk of the
    // range-based checks. WMO codes are non-negative in practice, but
    // locking in the current behavior prevents silent regressions.
    expect(wmoCodeToIcon(-1, true)).toBe('cloud-sun');
    expect(wmoCodeToIcon(-1, false)).toBe('cloud-moon');
  });

  describe('boundary conditions', () => {
    it('code 50 (between fog and drizzle range) returns fallback', () => {
      expect(wmoCodeToIcon(50, true)).toBe(FALLBACK_ICON);
    });

    it('code 58 (above drizzle range) returns fallback', () => {
      expect(wmoCodeToIcon(58, true)).toBe(FALLBACK_ICON);
    });

    it('code 60 (below rain range) returns fallback', () => {
      expect(wmoCodeToIcon(60, true)).toBe(FALLBACK_ICON);
    });

    it('code 68 (above rain range) returns fallback', () => {
      expect(wmoCodeToIcon(68, true)).toBe(FALLBACK_ICON);
    });

    it('code 78 (above snow range) returns fallback', () => {
      expect(wmoCodeToIcon(78, true)).toBe(FALLBACK_ICON);
    });

    it('code 83 (between rain shower and snow shower ranges) returns fallback', () => {
      expect(wmoCodeToIcon(83, true)).toBe(FALLBACK_ICON);
    });

    it('code 87 (above snow shower range) returns fallback', () => {
      expect(wmoCodeToIcon(87, true)).toBe(FALLBACK_ICON);
    });

    it('code 94 (below thunderstorm range) returns fallback', () => {
      expect(wmoCodeToIcon(94, true)).toBe(FALLBACK_ICON);
    });
  });
});

// ── weatherApiCodeToIcon ─────────────────────────────────────────────

describe('weatherApiCodeToIcon', () => {
  it('maps clear (1000) to sun/moon based on isDay', () => {
    expect(weatherApiCodeToIcon(1000, true)).toBe('sun');
    expect(weatherApiCodeToIcon(1000, false)).toBe('moon');
  });

  it('maps partly cloudy (1003) to cloud-sun/cloud-moon based on isDay', () => {
    expect(weatherApiCodeToIcon(1003, true)).toBe('cloud-sun');
    expect(weatherApiCodeToIcon(1003, false)).toBe('cloud-moon');
  });

  it('maps cloudy/overcast codes (1006, 1009) to cloud', () => {
    expect(weatherApiCodeToIcon(1006, true)).toBe('cloud');
    expect(weatherApiCodeToIcon(1009, false)).toBe('cloud');
  });

  it('maps fog/mist codes to cloud-fog', () => {
    expect(weatherApiCodeToIcon(1030, true)).toBe('cloud-fog');
    expect(weatherApiCodeToIcon(1117, true)).toBe('cloud-fog');
    expect(weatherApiCodeToIcon(1135, true)).toBe('cloud-fog');
    expect(weatherApiCodeToIcon(1147, true)).toBe('cloud-fog');
  });

  it('maps drizzle/light rain codes to cloud-drizzle', () => {
    expect(weatherApiCodeToIcon(1063, true)).toBe('cloud-drizzle');
    expect(weatherApiCodeToIcon(1150, true)).toBe('cloud-drizzle');
    expect(weatherApiCodeToIcon(1153, true)).toBe('cloud-drizzle');
    expect(weatherApiCodeToIcon(1180, true)).toBe('cloud-drizzle');
    expect(weatherApiCodeToIcon(1183, true)).toBe('cloud-drizzle');
  });

  it('maps rain codes to cloud-rain', () => {
    expect(weatherApiCodeToIcon(1186, true)).toBe('cloud-rain');
    expect(weatherApiCodeToIcon(1189, true)).toBe('cloud-rain');
    expect(weatherApiCodeToIcon(1192, true)).toBe('cloud-rain');
    expect(weatherApiCodeToIcon(1195, true)).toBe('cloud-rain');
    expect(weatherApiCodeToIcon(1240, true)).toBe('cloud-rain');
    expect(weatherApiCodeToIcon(1243, true)).toBe('cloud-rain');
    expect(weatherApiCodeToIcon(1246, true)).toBe('cloud-rain');
  });

  it('maps snow codes to snowflake', () => {
    expect(weatherApiCodeToIcon(1066, true)).toBe('snowflake');
    expect(weatherApiCodeToIcon(1114, true)).toBe('snowflake');
    expect(weatherApiCodeToIcon(1210, true)).toBe('snowflake');
    expect(weatherApiCodeToIcon(1225, true)).toBe('snowflake');
    expect(weatherApiCodeToIcon(1255, true)).toBe('snowflake');
    expect(weatherApiCodeToIcon(1258, true)).toBe('snowflake');
  });

  it('maps sleet/hail/freezing rain codes to cloud-hail', () => {
    expect(weatherApiCodeToIcon(1069, true)).toBe('cloud-hail');
    expect(weatherApiCodeToIcon(1072, true)).toBe('cloud-hail');
    expect(weatherApiCodeToIcon(1168, true)).toBe('cloud-hail');
    expect(weatherApiCodeToIcon(1171, true)).toBe('cloud-hail');
    expect(weatherApiCodeToIcon(1198, true)).toBe('cloud-hail');
    expect(weatherApiCodeToIcon(1201, true)).toBe('cloud-hail');
    expect(weatherApiCodeToIcon(1237, true)).toBe('cloud-hail');
  });

  it('maps thunderstorm codes to cloud-lightning', () => {
    expect(weatherApiCodeToIcon(1087, true)).toBe('cloud-lightning');
    expect(weatherApiCodeToIcon(1273, true)).toBe('cloud-lightning');
    expect(weatherApiCodeToIcon(1276, true)).toBe('cloud-lightning');
    expect(weatherApiCodeToIcon(1279, true)).toBe('cloud-lightning');
    expect(weatherApiCodeToIcon(1282, true)).toBe('cloud-lightning');
  });

  it('returns fallback for unknown codes', () => {
    expect(weatherApiCodeToIcon(9999, true)).toBe(FALLBACK_ICON);
    expect(weatherApiCodeToIcon(0, true)).toBe(FALLBACK_ICON);
    expect(weatherApiCodeToIcon(-1, true)).toBe(FALLBACK_ICON);
  });

  it('day/night only affects clear and partly-cloudy intermediates', () => {
    // cloud-rain should be the same regardless of isDay
    expect(weatherApiCodeToIcon(1186, true)).toBe('cloud-rain');
    expect(weatherApiCodeToIcon(1186, false)).toBe('cloud-rain');
    // snowflake same regardless of isDay
    expect(weatherApiCodeToIcon(1066, true)).toBe('snowflake');
    expect(weatherApiCodeToIcon(1066, false)).toBe('snowflake');
  });
});

// ── inferIconFromText (NOAA-style keyword matcher) ───────────────────

describe('inferIconFromText', () => {
  it('maps thunderstorm/storm descriptions to cloud-lightning', () => {
    expect(inferIconFromText('Thunderstorms', true)).toBe('cloud-lightning');
    expect(inferIconFromText('Scattered Thunderstorms', true)).toBe('cloud-lightning');
    expect(inferIconFromText('Tropical Storm Warning', true)).toBe('cloud-lightning');
    expect(inferIconFromText('Severe storms possible', false)).toBe('cloud-lightning');
  });

  it('maps snow/blizzard descriptions to snowflake', () => {
    expect(inferIconFromText('Heavy Snow', true)).toBe('snowflake');
    expect(inferIconFromText('Blizzard Warning', true)).toBe('snowflake');
    expect(inferIconFromText('Snow flurries', true)).toBe('snowflake');
  });

  it('maps sleet/ice/freezing descriptions to cloud-hail', () => {
    expect(inferIconFromText('Sleet', true)).toBe('cloud-hail');
    expect(inferIconFromText('Ice pellets', true)).toBe('cloud-hail');
    expect(inferIconFromText('Freezing rain', true)).toBe('cloud-hail');
  });

  it('"Ice storm" triggers storm (thunderstorm) before ice (hail) due to priority', () => {
    // "storm" keyword is checked first — this locks in the priority behavior
    expect(inferIconFromText('Ice storm', true)).toBe('cloud-lightning');
  });

  it('maps rain/shower/drizzle descriptions to cloud-rain', () => {
    expect(inferIconFromText('Rain', true)).toBe('cloud-rain');
    expect(inferIconFromText('Scattered Showers', true)).toBe('cloud-rain');
    expect(inferIconFromText('Light Drizzle', true)).toBe('cloud-rain');
  });

  it('maps fog/haze/mist descriptions to cloud-fog', () => {
    expect(inferIconFromText('Foggy', true)).toBe('cloud-fog');
    expect(inferIconFromText('Haze', true)).toBe('cloud-fog');
    expect(inferIconFromText('Mist', true)).toBe('cloud-fog');
  });

  it('maps partly cloudy / mostly sunny / mostly clear to cloud-sun/cloud-moon', () => {
    expect(inferIconFromText('Partly Cloudy', true)).toBe('cloud-sun');
    expect(inferIconFromText('Partly Cloudy', false)).toBe('cloud-moon');
    expect(inferIconFromText('Mostly Sunny', true)).toBe('cloud-sun');
    expect(inferIconFromText('Mostly Clear', false)).toBe('cloud-moon');
  });

  it('maps cloud/overcast descriptions to cloud', () => {
    expect(inferIconFromText('Cloudy', true)).toBe('cloud');
    expect(inferIconFromText('Overcast', true)).toBe('cloud');
    expect(inferIconFromText('Mostly Cloudy', true)).toBe('cloud');
  });

  it('maps sunny/clear descriptions to sun/moon', () => {
    expect(inferIconFromText('Sunny', true)).toBe('sun');
    expect(inferIconFromText('Sunny', false)).toBe('moon');
    expect(inferIconFromText('Clear', true)).toBe('sun');
    expect(inferIconFromText('Clear', false)).toBe('moon');
  });

  it('returns fallback for unrecognized descriptions', () => {
    expect(inferIconFromText('N/A', true)).toBe(FALLBACK_ICON);
    expect(inferIconFromText('', true)).toBe(FALLBACK_ICON);
    expect(inferIconFromText('Hot', true)).toBe(FALLBACK_ICON);
  });

  describe('priority ordering', () => {
    it('thunderstorm beats rain (storms include rain)', () => {
      expect(inferIconFromText('Thunderstorm with rain', true)).toBe('cloud-lightning');
    });

    it('snow beats cloud', () => {
      expect(inferIconFromText('Snow with overcast clouds', true)).toBe('snowflake');
    });

    it('freezing rain triggers hail (not rain)', () => {
      expect(inferIconFromText('Freezing Rain Advisory', true)).toBe('cloud-hail');
    });

    it('"Partly Cloudy with Scattered Thunderstorms" triggers thunderstorm (not partly)', () => {
      expect(inferIconFromText('Partly Cloudy with Scattered Thunderstorms', true)).toBe('cloud-lightning');
    });
  });

  describe('case insensitivity', () => {
    it('handles all-uppercase descriptions', () => {
      expect(inferIconFromText('THUNDERSTORM', true)).toBe('cloud-lightning');
      expect(inferIconFromText('HEAVY SNOW', true)).toBe('snowflake');
      expect(inferIconFromText('SUNNY', true)).toBe('sun');
    });

    it('handles mixed-case descriptions', () => {
      expect(inferIconFromText('pArTlY cLoUdY', true)).toBe('cloud-sun');
    });
  });
});

// ── Static icon map integrity ────────────────────────────────────────

describe('OWM_ICON_MAP', () => {
  it('covers all standard OWM icon codes (01-50, d and n)', () => {
    const expectedCodes = ['01', '02', '03', '04', '09', '10', '11', '13', '50'];
    for (const code of expectedCodes) {
      expect(OWM_ICON_MAP[`${code}d`]).toBeDefined();
      expect(OWM_ICON_MAP[`${code}n`]).toBeDefined();
    }
  });

  it('maps day/night variants of clear correctly', () => {
    expect(OWM_ICON_MAP['01d']).toBe('sun');
    expect(OWM_ICON_MAP['01n']).toBe('moon');
  });

  it('maps day/night variants of partly cloudy correctly', () => {
    expect(OWM_ICON_MAP['02d']).toBe('cloud-sun');
    expect(OWM_ICON_MAP['02n']).toBe('cloud-moon');
  });

  it('all values are valid WeatherIconName values', () => {
    const validIcons = new Set([
      'sun', 'moon', 'cloud-sun', 'cloud-moon', 'cloud',
      'cloud-rain', 'cloud-drizzle', 'cloud-lightning',
      'cloud-hail', 'cloud-fog', 'snowflake', 'thermometer',
    ]);
    for (const icon of Object.values(OWM_ICON_MAP)) {
      expect(validIcons.has(icon)).toBe(true);
    }
  });
});

describe('PIRATE_ICON_MAP', () => {
  it('covers all standard Pirate Weather icon strings', () => {
    const expected = [
      'clear-day', 'clear-night', 'partly-cloudy-day', 'partly-cloudy-night',
      'cloudy', 'rain', 'snow', 'sleet', 'thunderstorm', 'fog', 'wind',
    ];
    for (const key of expected) {
      expect(PIRATE_ICON_MAP[key]).toBeDefined();
    }
  });

  it('maps day/night clear variants correctly', () => {
    expect(PIRATE_ICON_MAP['clear-day']).toBe('sun');
    expect(PIRATE_ICON_MAP['clear-night']).toBe('moon');
  });

  it('all values are valid WeatherIconName values', () => {
    const validIcons = new Set([
      'sun', 'moon', 'cloud-sun', 'cloud-moon', 'cloud',
      'cloud-rain', 'cloud-drizzle', 'cloud-lightning',
      'cloud-hail', 'cloud-fog', 'snowflake', 'thermometer',
    ]);
    for (const icon of Object.values(PIRATE_ICON_MAP)) {
      expect(validIcons.has(icon)).toBe(true);
    }
  });
});

describe('FALLBACK_ICON', () => {
  it('is thermometer', () => {
    expect(FALLBACK_ICON).toBe('thermometer');
  });
});
