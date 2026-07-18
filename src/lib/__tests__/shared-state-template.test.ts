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
    expect(resolveSharedStateTokens('{gone}', states({}), { placeholder: '?' })).toBe('?');
  });
});

describe('token filters', () => {
  it('extracts keys with filters stripped', () => {
    expect(extractSharedStateKeys('{plugin:ha:sensor.temp|round:1} {plugin:ha:door|default:closed}'))
      .toEqual(['plugin:ha:door', 'plugin:ha:sensor.temp']);
  });

  it('round:N rounds numeric values', () => {
    const s = states({ 'plugin:ha:sensor.temp': '72.53333' });
    expect(resolveSharedStateTokens('{plugin:ha:sensor.temp|round:1} °F', s)).toBe('72.5 °F');
    expect(resolveSharedStateTokens('{plugin:ha:sensor.temp|round:0} °F', s)).toBe('73 °F');
  });

  it('round:N honors the formatting locale', () => {
    const s = states({ 'plugin:ha:sensor.temp': '72.53333' });
    expect(resolveSharedStateTokens('{plugin:ha:sensor.temp|round:1}', s, { locale: 'de-DE' }))
      .toBe('72,5');
  });

  it('round passes non-numeric and empty values through unchanged', () => {
    expect(resolveSharedStateTokens('{k|round:1}', states({ k: 'on' }))).toBe('on');
    expect(resolveSharedStateTokens('{k|round:1}', states({ k: '' }))).toBe('');
  });

  it('round on an unpublished key falls through to the placeholder', () => {
    expect(resolveSharedStateTokens('{k|round:1}', states({}))).toBe(UNKNOWN_VALUE_PLACEHOLDER);
  });

  it('default: replaces the placeholder for unpublished keys only', () => {
    expect(resolveSharedStateTokens('{k|default:unknown}', states({}))).toBe('unknown');
    expect(resolveSharedStateTokens('{k|default:unknown}', states({ k: 'on' }))).toBe('on');
    // Empty published value is a value, not "unpublished".
    expect(resolveSharedStateTokens('[{k|default:x}]', states({ k: '' }))).toBe('[]');
  });

  it('default: with empty text renders empty', () => {
    expect(resolveSharedStateTokens('[{k|default:}]', states({}))).toBe('[]');
  });

  it('filters chain left to right', () => {
    expect(resolveSharedStateTokens('{k|round:0|default:n/a}', states({ k: '19.6' }))).toBe('20');
    expect(resolveSharedStateTokens('{k|round:0|default:n/a}', states({}))).toBe('n/a');
  });

  it('unrecognized or malformed filters render the token literally', () => {
    const s = states({ k: '5' });
    expect(resolveSharedStateTokens('{k|upper}', s)).toBe('{k|upper}');
    expect(resolveSharedStateTokens('{k|round}', s)).toBe('{k|round}');
    expect(resolveSharedStateTokens('{k|round:x}', s)).toBe('{k|round:x}');
    expect(resolveSharedStateTokens('{k|round:99}', s)).toBe('{k|round:99}');
    expect(resolveSharedStateTokens('{k|}', s)).toBe('{k|}');
    // One bad segment poisons the whole token, even alongside a good one.
    expect(resolveSharedStateTokens('{k|round:1|nope}', s)).toBe('{k|round:1|nope}');
  });

  it('a filtered token still ignores double-brace template variables', () => {
    expect(resolveSharedStateTokens('{{time}} {k|round:0}', states({ k: '1.4' }))).toBe('{{time}} 1');
    expect(extractSharedStateKeys('{{time}}')).toEqual([]);
  });
});
