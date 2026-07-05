import { describe, it, expect } from 'vitest';
import {
  extractSharedStateKeys,
  resolveSharedStateTokens,
  UNKNOWN_VALUE_PLACEHOLDER,
} from '@/lib/shared-state-template';
import type { SharedStateEntry } from '@/lib/shared-state-types';

function states(entries: Record<string, string>): ReadonlyMap<string, SharedStateEntry> {
  return new Map(Object.entries(entries).map(([k, v]) => [k, { value: v, updatedAt: 1 }]));
}

describe('extractSharedStateKeys', () => {
  it('extracts namespaced plugin keys, deduped and sorted', () => {
    const text = 'Temp {plugin:ha:sensor.temp} / door {plugin:ha:door} / again {plugin:ha:door}';
    expect(extractSharedStateKeys(text)).toEqual(['plugin:ha:door', 'plugin:ha:sensor.temp']);
  });

  it('returns empty for text without tokens', () => {
    expect(extractSharedStateKeys('plain text')).toEqual([]);
    expect(extractSharedStateKeys('')).toEqual([]);
  });

  it('ignores double-brace template variables like {{time}}', () => {
    expect(extractSharedStateKeys('It is {{time}} on {{day}}')).toEqual([]);
  });

  it('ignores tokens with characters outside the key charset', () => {
    expect(extractSharedStateKeys('{Not A Key} {UPPER} {a b}')).toEqual([]);
  });

  it('extracts a single-brace token adjacent to double-brace templates', () => {
    expect(extractSharedStateKeys('{{time}} — {plugin:ha:sensor.temp}°'))
      .toEqual(['plugin:ha:sensor.temp']);
  });

  it('extracts a token immediately followed by a literal closing brace', () => {
    expect(extractSharedStateKeys('{plugin:ha:state}}')).toEqual(['plugin:ha:state']);
  });

  it('ignores unclosed braces; a nested inner token still resolves', () => {
    expect(extractSharedStateKeys('{unclosed')).toEqual([]);
    // The outer {a...c} is not a valid token (contains braces), but the
    // inner {b} is — same as any other brace-adjacent token.
    expect(extractSharedStateKeys('{a{b}c}')).toEqual(['b']);
  });
});

describe('resolveSharedStateTokens', () => {
  it('substitutes published values', () => {
    const out = resolveSharedStateTokens(
      'Battery: {plugin:ha:sensor.battery}%',
      states({ 'plugin:ha:sensor.battery': '87' }),
    );
    expect(out).toBe('Battery: 87%');
  });

  it('renders the en-dash placeholder for unknown keys', () => {
    const out = resolveSharedStateTokens('Battery: {plugin:ha:sensor.battery}%', states({}));
    expect(out).toBe(`Battery: ${UNKNOWN_VALUE_PLACEHOLDER}%`);
  });

  it('substitutes an empty published value as empty, not as the placeholder', () => {
    const out = resolveSharedStateTokens('[{k.e.y}]', states({ 'k.e.y': '' }));
    expect(out).toBe('[]');
  });

  it('leaves double-brace template variables untouched', () => {
    const out = resolveSharedStateTokens('{{time}} · {plugin:ha:door}', states({ 'plugin:ha:door': 'open' }));
    expect(out).toBe('{{time}} · open');
  });

  it('accepts a custom placeholder', () => {
    expect(resolveSharedStateTokens('{gone}', states({}), '?')).toBe('?');
  });
});
