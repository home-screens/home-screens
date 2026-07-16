import { describe, it, expect } from 'vitest';
import { buildSuggestions } from '../ConditionTreeEditor';
import type { StateKeyDescriptor } from '@/types/plugins';
import type { ProvidedStateKey } from '@/lib/shared-state-types';

/**
 * The combobox's merged suggestion list: async plugin search results lead
 * (already query-filtered and relevance-ordered upstream, carrying friendly
 * names, live values, and plugin/group sections), static provider keys
 * follow with local query filtering, and duplicates collapse toward the
 * search result. A draft that exactly matches a known key keeps the full
 * static list visible so the user can still switch keys.
 */

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
