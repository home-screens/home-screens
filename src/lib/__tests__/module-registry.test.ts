import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  MODULE_CATEGORIES,
  getModuleDefinition,
  getAllModuleDefinitions,
  getModulesByCategory,
} from '@/lib/module-registry';
import type { ModuleType, BuiltinModuleType } from '@/types/config';

const ALL_MODULE_TYPES: ModuleType[] = [
  'clock', 'calendar', 'weather',
  'countdown', 'dad-joke', 'text', 'image', 'quote', 'todo',
  'sticky-note', 'greeting', 'news', 'stock-ticker', 'crypto',
  'word-of-day', 'history', 'moon-phase', 'sunrise-sunset',
  'photo-slideshow', 'qr-code', 'year-progress', 'traffic',
  'sports', 'air-quality', 'todoist', 'rain-map',
  'multi-month', 'garbage-day', 'standings', 'affirmations',
  'date', 'meal-planner', 'iframe', 'chore-chart',
  'fullscreen-calendar', 'fullscreen-chore-chart', 'fullscreen-meal-planner',
  'fullscreen-photo', 'display-control', 'icon', 'shape',
];

describe('MODULE_CATEGORIES', () => {
  it('contains exactly the 8 expected categories in order', () => {
    expect(MODULE_CATEGORIES).toEqual([
      'Full Screen',
      'Time & Date',
      'Weather & Environment',
      'News & Finance',
      'Knowledge & Fun',
      'Personal',
      'Media & Display',
      'Travel',
    ]);
  });
});

describe('Registry completeness', () => {
  it('registers all 41 module types', () => {
    for (const type of ALL_MODULE_TYPES) {
      expect(getModuleDefinition(type as ModuleType), `Missing module: ${type}`).toBeDefined();
    }
  });

  it('every module has a non-empty label', () => {
    for (const def of getAllModuleDefinitions()) {
      expect(def.label.length, `${def.type} has empty label`).toBeGreaterThan(0);
    }
  });

  it('every module has a defaultSize with w and h > 0', () => {
    for (const def of getAllModuleDefinitions()) {
      expect(def.defaultSize.w, `${def.type} defaultSize.w`).toBeGreaterThan(0);
      expect(def.defaultSize.h, `${def.type} defaultSize.h`).toBeGreaterThan(0);
    }
  });

  it('every built-in module has a category that is one of the 8 valid categories', () => {
    const validCategories = new Set<string>(MODULE_CATEGORIES);
    for (const def of getAllModuleDefinitions()) {
      if (def.type.startsWith('plugin:')) continue; // plugins may use custom categories
      expect(validCategories.has(def.category), `${def.type} has invalid category: ${def.category}`).toBe(true);
    }
  });

  it('every module has an icon (Lucide component)', () => {
    for (const def of getAllModuleDefinitions()) {
      // Lucide icons are React forwardRef objects with a render function
      expect(def.icon, `${def.type} should have an icon`).toBeDefined();
      expect(def.icon, `${def.type} icon should not be null`).not.toBeNull();
    }
  });

  it('every module has a defaultConfig that is a plain object', () => {
    for (const def of getAllModuleDefinitions()) {
      expect(def.defaultConfig, `${def.type} defaultConfig`).toBeTypeOf('object');
      expect(def.defaultConfig, `${def.type} defaultConfig should not be null`).not.toBeNull();
    }
  });
});

describe('getModuleDefinition', () => {
  it('returns the correct definition for clock', () => {
    const def = getModuleDefinition('clock');
    expect(def).toBeDefined();
    expect(def!.type).toBe('clock');
    expect(def!.label).toBe('Clock');
    expect(def!.category).toBe('Time & Date');
  });

  it('returns the correct definition for calendar', () => {
    const def = getModuleDefinition('calendar');
    expect(def).toBeDefined();
    expect(def!.type).toBe('calendar');
    expect(def!.label).toBe('Calendar');
    expect(def!.category).toBe('Time & Date');
  });

  it('returns the correct definition for traffic', () => {
    const def = getModuleDefinition('traffic');
    expect(def).toBeDefined();
    expect(def!.type).toBe('traffic');
    expect(def!.label).toBe('Traffic / Commute');
    expect(def!.category).toBe('Travel');
  });

  it('returns the correct definition for air-quality', () => {
    const def = getModuleDefinition('air-quality');
    expect(def).toBeDefined();
    expect(def!.type).toBe('air-quality');
    expect(def!.label).toBe('Air Quality');
    expect(def!.category).toBe('Weather & Environment');
  });

  it('returns undefined for an unknown type', () => {
    const def = getModuleDefinition('nonexistent-widget' as ModuleType);
    expect(def).toBeUndefined();
  });

  describe('defaultConfig has expected keys', () => {
    it('clock has format24h, showSeconds, showDate, dateFormat, showWeekNumber, showDayOfYear', () => {
      const config = getModuleDefinition('clock')!.defaultConfig;
      expect(config).toHaveProperty('format24h');
      expect(config).toHaveProperty('showSeconds');
      expect(config).toHaveProperty('showDate');
      expect(config).toHaveProperty('dateFormat');
      expect(config).toHaveProperty('showWeekNumber');
      expect(config).toHaveProperty('showDayOfYear');
    });

    it('calendar has viewMode, daysToShow, showTime, showLocation, maxEvents, showWeekNumbers', () => {
      const config = getModuleDefinition('calendar')!.defaultConfig;
      expect(config).toHaveProperty('viewMode');
      expect(config).toHaveProperty('daysToShow');
      expect(config).toHaveProperty('showTime');
      expect(config).toHaveProperty('showLocation');
      expect(config).toHaveProperty('maxEvents');
      expect(config).toHaveProperty('showWeekNumbers');
    });

    it('traffic has routes array and refreshIntervalMs', () => {
      const config = getModuleDefinition('traffic')!.defaultConfig;
      expect(config).toHaveProperty('routes');
      expect(config).toHaveProperty('refreshIntervalMs');
      expect(Array.isArray(config.routes)).toBe(true);
    });

    it('air-quality has showAQI, showPollutants, refreshIntervalMs', () => {
      const config = getModuleDefinition('air-quality')!.defaultConfig;
      expect(config).toHaveProperty('showAQI');
      expect(config).toHaveProperty('showPollutants');
      expect(config).toHaveProperty('refreshIntervalMs');
    });
  });
});

describe('getAllModuleDefinitions', () => {
  it('returns an array of length 41', () => {
    expect(getAllModuleDefinitions()).toHaveLength(41);
  });

  it('all items have required fields', () => {
    for (const def of getAllModuleDefinitions()) {
      expect(def).toHaveProperty('type');
      expect(def).toHaveProperty('label');
      expect(def).toHaveProperty('icon');
      expect(def).toHaveProperty('category');
      expect(def).toHaveProperty('defaultConfig');
      expect(def).toHaveProperty('defaultSize');
    }
  });

  it('returns unique module types (no duplicates)', () => {
    const types = getAllModuleDefinitions().map((d) => d.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('contains exactly the expected set of module types', () => {
    const types = new Set(getAllModuleDefinitions().map((d) => d.type));
    for (const expected of ALL_MODULE_TYPES) {
      expect(types.has(expected), `Missing: ${expected}`).toBe(true);
    }
    expect(types.size).toBe(ALL_MODULE_TYPES.length);
  });
});

describe('getModulesByCategory', () => {
  it('returns a Map with exactly 8 categories', () => {
    const grouped = getModulesByCategory();
    expect(grouped.size).toBe(8);
  });

  it('the Map keys match MODULE_CATEGORIES exactly', () => {
    const grouped = getModulesByCategory();
    const keys = Array.from(grouped.keys());
    expect(keys).toEqual(MODULE_CATEGORIES);
  });

  it('every category has at least 1 module', () => {
    const grouped = getModulesByCategory();
    for (const [cat, modules] of grouped) {
      expect(modules.length, `Category "${cat}" is empty`).toBeGreaterThanOrEqual(1);
    }
  });

  it('Full Screen contains fullscreen-calendar, fullscreen-chore-chart, fullscreen-meal-planner, fullscreen-photo', () => {
    const grouped = getModulesByCategory();
    const types = grouped.get('Full Screen')!.map((d) => d.type);
    expect(types).toContain('fullscreen-calendar');
    expect(types).toContain('fullscreen-chore-chart');
    expect(types).toContain('fullscreen-meal-planner');
    expect(types).toContain('fullscreen-photo');
    expect(types).toHaveLength(4);
  });

  it('Time & Date contains clock, calendar, countdown, year-progress', () => {
    const grouped = getModulesByCategory();
    const types = grouped.get('Time & Date')!.map((d) => d.type);
    expect(types).toContain('clock');
    expect(types).toContain('calendar');
    expect(types).toContain('countdown');
    expect(types).toContain('year-progress');
  });

  it('Weather & Environment contains weather, moon-phase, sunrise-sunset, air-quality', () => {
    const grouped = getModulesByCategory();
    const types = grouped.get('Weather & Environment')!.map((d) => d.type);
    expect(types).toContain('weather');
    expect(types).toContain('moon-phase');
    expect(types).toContain('sunrise-sunset');
    expect(types).toContain('air-quality');
  });

  it('News & Finance contains news, stock-ticker, crypto, sports', () => {
    const grouped = getModulesByCategory();
    const types = grouped.get('News & Finance')!.map((d) => d.type);
    expect(types).toContain('news');
    expect(types).toContain('stock-ticker');
    expect(types).toContain('crypto');
    expect(types).toContain('sports');
  });

  it('Knowledge & Fun contains dad-joke, quote, word-of-day, history', () => {
    const grouped = getModulesByCategory();
    const types = grouped.get('Knowledge & Fun')!.map((d) => d.type);
    expect(types).toContain('dad-joke');
    expect(types).toContain('quote');
    expect(types).toContain('word-of-day');
    expect(types).toContain('history');
  });

  it('Personal contains todo, sticky-note, greeting, affirmations', () => {
    const grouped = getModulesByCategory();
    const types = grouped.get('Personal')!.map((d) => d.type);
    expect(types).toContain('todo');
    expect(types).toContain('sticky-note');
    expect(types).toContain('greeting');
    expect(types).toContain('affirmations');
  });

  it('Media & Display contains text, image, photo-slideshow, qr-code', () => {
    const grouped = getModulesByCategory();
    const types = grouped.get('Media & Display')!.map((d) => d.type);
    expect(types).toContain('text');
    expect(types).toContain('image');
    expect(types).toContain('photo-slideshow');
    expect(types).toContain('qr-code');
  });

  it('Travel contains traffic', () => {
    const grouped = getModulesByCategory();
    const types = grouped.get('Travel')!.map((d) => d.type);
    expect(types).toContain('traffic');
    expect(types).toHaveLength(1);
  });

  it('total modules across all categories equals 41 (no duplicates, no missing)', () => {
    const grouped = getModulesByCategory();
    let total = 0;
    const allTypes = new Set<string>();
    for (const modules of grouped.values()) {
      for (const mod of modules) {
        allTypes.add(mod.type);
        total++;
      }
    }
    expect(total).toBe(41);
    expect(allTypes.size).toBe(41);
  });
});

describe('Data correctness spot checks', () => {
  it('clock defaultConfig: format24h false, showSeconds true', () => {
    const config = getModuleDefinition('clock')!.defaultConfig;
    expect(config.format24h).toBe(false);
    expect(config.showSeconds).toBe(true);
    expect(config.showDate).toBe(true);
    expect(config.dateFormat).toBe('EEEE, MMMM d');
    expect(config.showWeekNumber).toBe(false);
    expect(config.showDayOfYear).toBe(false);
  });

  it('calendar defaultConfig: viewMode daily, daysToShow 3', () => {
    const config = getModuleDefinition('calendar')!.defaultConfig;
    expect(config.viewMode).toBe('daily');
    expect(config.daysToShow).toBe(3);
    expect(config.showTime).toBe(true);
    expect(config.showLocation).toBe(false);
    expect(config.maxEvents).toBe(20);
    expect(config.showWeekNumbers).toBe(false);
  });

  it('news defaultConfig: feedUrl empty, refreshIntervalMs 300000', () => {
    const config = getModuleDefinition('news')!.defaultConfig;
    expect(config.feedUrl).toBe('');
    expect(config.refreshIntervalMs).toBe(300000);
    expect(config.rotateIntervalMs).toBe(10000);
  });

  it('sports defaultConfig: leagues nba and nfl', () => {
    const config = getModuleDefinition('sports')!.defaultConfig;
    expect(config.leagues).toEqual(['nba', 'nfl']);
    expect(config.refreshIntervalMs).toBe(60000);
  });

  it('qr-code defaultConfig: fgColor white, bgColor transparent', () => {
    const config = getModuleDefinition('qr-code')!.defaultConfig;
    expect(config.mode).toBe('custom');
    expect(config.data).toBe('');
    expect(config.label).toBe('');
    expect(config.ssid).toBe('');
    expect(config.password).toBe('');
    expect(config.authType).toBe('WPA');
    expect(config.hiddenNetwork).toBe(false);
    expect(config.showPassword).toBe(true);
    expect(config.showNetworkName).toBe(true);
    expect(config.fgColor).toBe('#ffffff');
    expect(config.bgColor).toBe('transparent');
  });

  it('sticky-note defaultConfig: noteColor yellow', () => {
    const config = getModuleDefinition('sticky-note')!.defaultConfig;
    expect(config.content).toBe('Write something here...');
    expect(config.noteColor).toBe('#fef08a');
  });

  it('year-progress defaultConfig: all bars enabled by default', () => {
    const config = getModuleDefinition('year-progress')!.defaultConfig;
    expect(config.showYear).toBe(true);
    expect(config.showMonth).toBe(true);
    expect(config.showWeek).toBe(true);
    expect(config.showDay).toBe(true);
    expect(config.showPercentage).toBe(true);
  });

  it('weather defaultConfig: view hourly, iconSet color, provider global, hoursToShow 8, daysToShow 5', () => {
    const config = getModuleDefinition('weather')!.defaultConfig;
    expect(config.view).toBe('hourly');
    expect(config.iconSet).toBe('color');
    expect(config.provider).toBe('global');
    expect(config.hoursToShow).toBe(8);
    expect(config.daysToShow).toBe(5);
    expect(config.showFeelsLike).toBe(true);
    expect(config.showHighLow).toBe(true);
    expect(config.showPrecipitation).toBe(true);
    expect(config.showPrecipAmount).toBe(false);
    expect(config.showHumidity).toBe(false);
    expect(config.showWind).toBe(false);
  });

  it('air-quality defaultConfig: AQI on, pollutants off, 15min refresh', () => {
    const config = getModuleDefinition('air-quality')!.defaultConfig;
    expect(config.showAQI).toBe(true);
    expect(config.showPollutants).toBe(false);
    expect(config.refreshIntervalMs).toBe(900000);
  });
});

// ---------------------------------------------------------------------------
// Cross-wiring contract tests
//
// These verify that the 3 places a module must be registered stay in sync:
//   1. module-registry.ts  (the source of truth — also owns `defaultSize`,
//      which the TypeScript interface marks required so a missing size is
//      a compile error, not a runtime surprise)
//   2. module-components.ts (dynamic import map)
//   3. PropertyPanel.tsx    (CONFIG_SECTIONS)
// ---------------------------------------------------------------------------

/** Extract keys from a `const NAME ... = { key: ..., 'key': ... }` object in source. */
function extractKeysFromSource(filePath: string, anchor: string): string[] {
  const src = fs.readFileSync(filePath, 'utf-8');
  const idx = src.indexOf(anchor);
  if (idx === -1) return [];
  // Find the `= {` assignment after the anchor (skip type annotations, params, etc.)
  const assignIdx = src.indexOf('= {', idx);
  if (assignIdx === -1) return [];
  const braceStart = assignIdx + 2; // the `{`
  // Walk forward counting braces to find the matching close
  let depth = 0;
  let blockEnd = braceStart;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}') depth--;
    if (depth === 0) { blockEnd = i; break; }
  }
  const block = src.slice(braceStart, blockEnd + 1);
  const keys: string[] = [];
  // Match both 'key-name': and key: patterns at the top level
  for (const match of block.matchAll(/(?:'([^']+)'|"([^"]+)"|(\w[\w-]*))\s*:/g)) {
    keys.push(match[1] ?? match[2] ?? match[3]);
  }
  return keys;
}

const srcRoot = path.resolve(__dirname, '../..');

describe('Cross-wiring contract: every registered module is wired in all 4 places', () => {
  const builtinTypes = getAllModuleDefinitions()
    .map((d) => d.type)
    .filter((t) => !t.startsWith('plugin:')) as BuiltinModuleType[];

  const componentKeys = extractKeysFromSource(
    path.join(srcRoot, 'lib/module-components.ts'),
    'builtinComponents',
  );

  const configSectionKeys = extractKeysFromSource(
    path.join(srcRoot, 'components/editor/PropertyPanel.tsx'),
    'CONFIG_SECTIONS',
  );

  it('every built-in module has a dynamic import in module-components.ts', () => {
    for (const type of builtinTypes) {
      expect(componentKeys, `${type} missing from builtinComponents`).toContain(type);
    }
  });

  it('module-components.ts has no extra entries beyond registered modules', () => {
    const registeredSet = new Set(builtinTypes);
    for (const key of componentKeys) {
      expect(registeredSet.has(key as BuiltinModuleType), `builtinComponents has unregistered key: ${key}`).toBe(true);
    }
  });

  it('every built-in module has a non-zero default size on its registry entry', () => {
    // `defaultSize` is required on the `ModuleDefinition` interface, so a
    // missing field is a compile error. This test just guards against
    // someone writing `{ w: 0, h: 0 }` by accident, which would silently
    // spawn zero-sized drops from the palette.
    for (const type of builtinTypes) {
      const def = getModuleDefinition(type)!;
      expect(def.defaultSize.w, `${type} has zero width`).toBeGreaterThan(0);
      expect(def.defaultSize.h, `${type} has zero height`).toBeGreaterThan(0);
    }
  });

  it('every built-in module has a CONFIG_SECTIONS entry in PropertyPanel.tsx', () => {
    for (const type of builtinTypes) {
      expect(configSectionKeys, `${type} missing from CONFIG_SECTIONS`).toContain(type);
    }
  });

  it('CONFIG_SECTIONS has no extra entries beyond registered modules', () => {
    const registeredSet = new Set(builtinTypes);
    for (const key of configSectionKeys) {
      expect(registeredSet.has(key as BuiltinModuleType), `CONFIG_SECTIONS has unregistered key: ${key}`).toBe(true);
    }
  });
});
