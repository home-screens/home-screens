import { describe, it, expect } from 'vitest';
import {
  buildSuggestions,
  producerLabel,
  buildAvailableGroups,
  buildPreviewRuns,
} from '../state-key-suggestions';
import type { AvailableRow } from '../state-key-suggestions';
import type { StateKeyDescriptor } from '@/types/plugins';
import type { ProvidedStateKey } from '@/lib/shared-state-types';
import type { TranslateFn } from '@/i18n';
import type { LoadedPlugin } from '@/types/plugins';

/**
 * The shared suggestion/browse logic behind the condition combobox and the
 * Shared state "Available" tab: the search+static merge (async plugin search
 * results lead, static provider keys follow with local filtering, duplicates
 * collapse toward the search result), producer labeling, producer grouping
 * with sub-header bucketing and cap detection, and the per-category preview
 * math. The E2E specs cover the rendered surfaces; these pin the branches
 * they can't reach cheaply.
 */

/** Echo translator: key plus interpolations, so assertions see both. */
const t: TranslateFn = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}(${Object.values(params).join(',')})` : key) as TranslateFn;

type Searched = StateKeyDescriptor & { pluginName: string };

const DOOR: Searched = {
  key: 'plugin:ha:binary_sensor.door',
  label: 'Back Door',
  valueType: 'enum',
  group: 'Kitchen',
  currentValue: 'on',
  pluginName: 'Home Assistant',
};

const TEMP: Searched = {
  key: 'plugin:ha:sensor.temp',
  label: 'Temperature',
  valueType: 'numeric',
  currentValue: '72.5',
  unit: '°F',
  pluginName: 'Home Assistant',
};

const OPTIONS: ProvidedStateKey[] = [
  { key: 'plugin:ha:binary_sensor.door', label: 'Door (static)' },
  { key: 'weather:condition', label: 'Weather condition', sampleValues: ['clear', 'rain'] },
  { key: 'clock:hour', label: 'Hour of day' },
];

describe('buildSuggestions', () => {
  it('leads with search results: section headers, live value with unit appended', () => {
    const out = buildSuggestions([DOOR, TEMP], [], 'anything', false);
    expect(out).toEqual([
      {
        key: DOOR.key,
        primary: 'Back Door — on',
        secondary: DOOR.key,
        section: 'Home Assistant · Kitchen',
      },
      {
        key: TEMP.key,
        primary: 'Temperature — 72.5 °F',
        secondary: TEMP.key,
        section: 'Home Assistant',
      },
    ]);
  });

  it('collapses a static key already present in the search results toward the search result', () => {
    const out = buildSuggestions([DOOR], OPTIONS, '', false);
    const doorRows = out.filter((s) => s.key === DOOR.key);
    expect(doorRows).toHaveLength(1);
    expect(doorRows[0].primary).toBe('Back Door — on');
  });

  it('filters static options by key or label, case-insensitively', () => {
    const out = buildSuggestions([], OPTIONS, 'WEATHER', false);
    expect(out.map((s) => s.key)).toEqual(['weather:condition']);
    const byLabel = buildSuggestions([], OPTIONS, 'hour of', false);
    expect(byLabel.map((s) => s.key)).toEqual(['clock:hour']);
  });

  it('shows sample values in the static primary line', () => {
    const out = buildSuggestions([], OPTIONS, 'weather', false);
    expect(out[0].primary).toBe('Weather condition (clear, rain)');
    expect(out[0].section).toBeUndefined();
  });

  it('an empty draft shows every static option', () => {
    const out = buildSuggestions([], OPTIONS, '', false);
    expect(out).toHaveLength(OPTIONS.length);
  });

  it('a draft matching a known key keeps the full list so the user can switch', () => {
    const out = buildSuggestions([], OPTIONS, 'clock:hour', true);
    expect(out.map((s) => s.key)).toEqual(OPTIONS.map((o) => o.key));
  });
});

describe('producerLabel', () => {
  const plugins = new Map<string, LoadedPlugin>([
    ['ha', { manifest: { id: 'HA', name: 'Home Assistant' } } as LoadedPlugin],
  ]);

  it('resolves a loaded plugin to its manifest name (id matched lowercased)', () => {
    expect(producerLabel('plugin:ha:door', plugins, t)).toBe('Home Assistant');
  });

  it('falls back to the raw plugin id when the plugin is not loaded', () => {
    expect(producerLabel('plugin:garmin:steps', plugins, t)).toBe('garmin');
  });

  it('labels non-plugin keys as built-in', () => {
    expect(producerLabel('house:mode', plugins, t)).toBe(
      'settings.sharedStatePage.builtInProducer',
    );
  });
});

describe('buildAvailableGroups', () => {
  const plugins = new Map<string, LoadedPlugin>([
    ['ha', { manifest: { id: 'HA', name: 'Home Assistant' } } as LoadedPlugin],
  ]);

  // The per-plugin request limit the caller asked search for; decoupled from
  // any specific SEARCH_LIMIT/BROWSE_SEARCH_LIMIT constant so cap detection is
  // tested against an explicit value.
  const REQUEST_LIMIT = 200;

  const sug = (key: string, section?: string) => ({ key, primary: `${key}!`, secondary: key, section });

  it('groups by producer in first-seen order and splits section into a sub-header', () => {
    const groups = buildAvailableGroups(
      [
        sug('plugin:ha:door', 'Home Assistant · Porch'),
        sug('plugin:ha:temp', 'Home Assistant · Kitchen'),
        sug('plugin:garmin:steps'),
      ],
      [],
      plugins,
      t,
      REQUEST_LIMIT,
    );

    // garmin is not loaded → producerLabel falls back to the raw id.
    expect(groups.map((g) => g.producer)).toEqual(['Home Assistant', 'garmin']);
    expect(groups[0].rows.map((r) => [r.key, r.subhead])).toEqual([
      ['plugin:ha:door', 'Porch'],
      ['plugin:ha:temp', 'Kitchen'],
    ]);
    expect(groups[1].rows.map((r) => r.subhead)).toEqual([undefined]);
    expect(groups.every((g) => !g.truncated)).toBe(true);
  });

  it('renders a bare section (producer name, no room) as a flat row with no sub-header', () => {
    const [group] = buildAvailableGroups(
      [sug('plugin:ha:mode', 'Home Assistant')],
      [],
      plugins,
      t,
      REQUEST_LIMIT,
    );
    expect(group.rows[0].subhead).toBeUndefined();
  });

  it('coalesces a sub-head into one contiguous run even when the input interleaves it with others', () => {
    // Mirrors a real Home Assistant integration that pairs a binary_sensor +
    // switch per capability, sorted by feature name — so domains alternate
    // in the plugin's own result order instead of arriving pre-grouped.
    const [group] = buildAvailableGroups(
      [
        sug('plugin:ha:binary_sensor.animal', 'Home Assistant · Binary sensor'),
        sug('plugin:ha:switch.animal', 'Home Assistant · Switch'),
        sug('plugin:ha:binary_sensor.baby_cry', 'Home Assistant · Binary sensor'),
        sug('plugin:ha:switch.baby_cry', 'Home Assistant · Switch'),
        sug('plugin:ha:binary_sensor.barking', 'Home Assistant · Binary sensor'),
      ],
      [],
      plugins,
      t,
      REQUEST_LIMIT,
    );

    // All Binary sensor rows precede all Switch rows (first-seen order),
    // instead of alternating the way the input did.
    expect(group.rows.map((r) => r.subhead)).toEqual([
      'Binary sensor',
      'Binary sensor',
      'Binary sensor',
      'Switch',
      'Switch',
    ]);
    expect(group.rows.map((r) => r.key)).toEqual([
      'plugin:ha:binary_sensor.animal',
      'plugin:ha:binary_sensor.baby_cry',
      'plugin:ha:binary_sensor.barking',
      'plugin:ha:switch.animal',
      'plugin:ha:switch.baby_cry',
    ]);
  });

  it('flags only the producer whose cross-plugin search hit the passed request limit', () => {
    const searched = Array.from({ length: REQUEST_LIMIT }, (_, i) => ({ key: `plugin:ha:e${i}` }));
    const groups = buildAvailableGroups(
      [sug('plugin:ha:door'), sug('plugin:garmin:steps')],
      searched,
      plugins,
      t,
      REQUEST_LIMIT,
    );

    expect(groups.find((g) => g.producer === 'Home Assistant')!.truncated).toBe(true);
    expect(groups.find((g) => g.producer === 'garmin')!.truncated).toBe(false);
  });

  it('does not flag a producer one result below the request limit', () => {
    const searched = Array.from({ length: REQUEST_LIMIT - 1 }, (_, i) => ({ key: `plugin:ha:e${i}` }));
    const [group] = buildAvailableGroups([sug('plugin:ha:door')], searched, plugins, t, REQUEST_LIMIT);
    expect(group.truncated).toBe(false);
  });
});

describe('buildPreviewRuns', () => {
  const row = (key: string, subhead?: string): AvailableRow => ({
    key,
    primary: `${key}!`,
    secondary: key,
    subhead,
  });
  const rowsWithSubhead = (subhead: string, n: number) =>
    Array.from({ length: n }, (_, i) => row(`k${i}`, subhead));

  it('splits a run longer than the preview limit into visible + hidden with the right count', () => {
    const runs = buildPreviewRuns('HA', rowsWithSubhead('Porch', 15), new Set(), 10);

    expect(runs).toHaveLength(1);
    expect(runs[0].collapsible).toBe(true);
    expect(runs[0].visible).toHaveLength(10);
    expect(runs[0].hiddenCount).toBe(5);
    expect(runs[0].runKey).toBe('HA::Porch');
  });

  it('does not split a run at or under the preview limit', () => {
    const runs = buildPreviewRuns('HA', rowsWithSubhead('Porch', 10), new Set(), 10);

    expect(runs[0].collapsible).toBe(false);
    expect(runs[0].visible).toHaveLength(10);
    expect(runs[0].hiddenCount).toBe(0);
  });

  it('reveals every row of an expanded run (still collapsible, nothing hidden)', () => {
    const runs = buildPreviewRuns('HA', rowsWithSubhead('Porch', 15), new Set(['HA::Porch']), 10);

    expect(runs[0].collapsible).toBe(true);
    expect(runs[0].visible).toHaveLength(15);
    expect(runs[0].hiddenCount).toBe(0);
  });

  it('splits distinct sub-heads into independent runs, previewing each on its own', () => {
    const rows = [...rowsWithSubhead('Porch', 12), ...rowsWithSubhead('Kitchen', 3)];
    const runs = buildPreviewRuns('HA', rows, new Set(), 10);

    expect(runs.map((r) => [r.subhead, r.visible.length, r.hiddenCount, r.collapsible])).toEqual([
      ['Porch', 10, 2, true],
      ['Kitchen', 3, 0, false],
    ]);
  });

  it('keys a flat (no sub-head) run as __flat__', () => {
    const rows = Array.from({ length: 11 }, (_, i) => row(`k${i}`));
    const runs = buildPreviewRuns('HA', rows, new Set(), 10);

    expect(runs[0].runKey).toBe('HA::__flat__');
    expect(runs[0].hiddenCount).toBe(1);
  });
});
