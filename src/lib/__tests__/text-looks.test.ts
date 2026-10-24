import { describe, it, expect } from 'vitest';
import type { ModuleStyle, TextLook } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { SharedStateEntry } from '../shared-state-types';
import {
  applyTextLook,
  collectTextLookKeys,
  lookContentOpacity,
  lookSetsAnything,
  resolveTextLooks,
  textLooksNeedClock,
} from '../text-looks';

function states(entries: Record<string, string>): ReadonlyMap<string, SharedStateEntry> {
  return new Map(Object.entries(entries).map(([k, v]) => [k, { value: v, updatedAt: 0 }]));
}

const TEMP = 'plugin:home-assistant:sensor.bedroom_temperature';

/** A Wednesday wall clock at the given hour. */
const at = (h: number) => ({ dayOfWeek: 3, minuteOfDay: h * 60, isoDate: '2026-10-21' });

/** The reporter's three bands: red above 24, amber 22 to 24, green 20 to 22. */
const bands: TextLook[] = [
  { id: 'hot', name: 'Too warm', when: [{ kind: 'numeric', sourceKey: TEMP, above: 24 }], textColor: '#f87171', borderColor: '#f87171', icon: '🌡' },
  { id: 'warm', name: 'Getting warm', when: [{ kind: 'numeric', sourceKey: TEMP, above: 22, below: 24, belowInclusive: true }], textColor: '#f59e0b', borderColor: '#f59e0b' },
  { id: 'ok', name: 'Just right', when: [{ kind: 'numeric', sourceKey: TEMP, above: 20, aboveInclusive: true, below: 22, belowInclusive: true }], textColor: '#34d399', borderColor: '#34d399' },
];

describe('resolveTextLooks', () => {
  it('returns the shared empty result for no looks', () => {
    const a = resolveTextLooks(undefined, states({}));
    const b = resolveTextLooks([], states({}));
    expect(a).toBe(b);
    expect(a.overrides).toEqual({});
    expect(a.showing).toEqual([]);
  });

  it('picks the band the value falls in and reports the others as not matching', () => {
    const r = resolveTextLooks(bands, states({ [TEMP]: '23.1' }));
    expect(r.overrides).toEqual({ textColor: '#f59e0b', borderColor: '#f59e0b' });
    expect(r.showing).toEqual(['warm']);
    expect(r.verdicts.get('hot')).toBe('unmet');
    expect(r.verdicts.get('warm')).toBe('showing');
    expect(r.verdicts.get('ok')).toBe('unmet');
  });

  it('carries the icon only from the rule that sets it', () => {
    expect(resolveTextLooks(bands, states({ [TEMP]: '24.6' })).overrides.icon).toBe('🌡');
    expect(resolveTextLooks(bands, states({ [TEMP]: '21' })).overrides.icon).toBeUndefined();
  });

  it('changes nothing when the value falls outside every band', () => {
    const r = resolveTextLooks(bands, states({ [TEMP]: '19.2' }));
    expect(r.overrides).toEqual({});
    expect(r.showing).toEqual([]);
  });

  it('treats an unpublished key as unknown and leaves the module alone', () => {
    const r = resolveTextLooks(bands, states({}));
    expect(r.overrides).toEqual({});
    expect(r.verdicts.get('hot')).toBe('unknown');
    expect(r.verdicts.get('warm')).toBe('unknown');
  });

  it('first rule to set a property wins; a later matching rule fills in what is left', () => {
    const looks: TextLook[] = [
      { id: 'a', when: [], textColor: '#111' },
      { id: 'b', when: [], textColor: '#222', borderColor: '#333' },
    ];
    const r = resolveTextLooks(looks, states({}));
    expect(r.overrides).toEqual({ textColor: '#111', borderColor: '#333' });
    expect(r.showing).toEqual(['a', 'b']);
    expect(r.verdicts.get('b')).toBe('showing');
  });

  it('reports a matching rule whose every property was already taken as overruled', () => {
    const looks: TextLook[] = [
      { id: 'a', when: [], textColor: '#111' },
      { id: 'b', when: [], textColor: '#222' },
    ];
    const r = resolveTextLooks(looks, states({}));
    expect(r.verdicts.get('b')).toBe('overruled');
    expect(r.showing).toEqual(['a']);
  });

  it('a rule with no conditions always holds, and one that sets nothing is overruled', () => {
    const r = resolveTextLooks([{ id: 'a', when: [] }], states({}));
    expect(r.verdicts.get('a')).toBe('overruled');
    expect(r.overrides).toEqual({});
  });

  it('evaluates time conditions on the given clock', () => {
    const looks: TextLook[] = [
      { id: 'night', when: [{ kind: 'time', startTime: '21:00', endTime: '06:00' }], opacity: 0.5 },
    ];
    expect(resolveTextLooks(looks, states({}), at(22)).overrides.opacity).toBe(0.5);
    expect(resolveTextLooks(looks, states({}), at(12)).overrides.opacity).toBeUndefined();
  });

  it('a mixed rule stays unknown while its key is missing even if the clock part holds', () => {
    const looks: TextLook[] = [
      { id: 'x', when: [{ kind: 'time', startTime: '00:00', endTime: '23:59' }, { kind: 'state', sourceKey: 'door', equals: 'open' }], textColor: '#f00' },
    ];
    expect(resolveTextLooks(looks, states({})).verdicts.get('x')).toBe('unknown');
    expect(resolveTextLooks(looks, states({ door: 'open' })).verdicts.get('x')).toBe('showing');
  });

  it('with no live values at all, decides the looks above the first key-reading one and nothing below it', () => {
    const looks: TextLook[] = [
      { id: 'top', when: [], textColor: '#1' },
      { id: 'night', when: [{ kind: 'time', startTime: '21:00', endTime: '06:00' }], icon: '🌙' },
      bands[0],
      { id: 'bottom', when: [], borderColor: '#2' },
    ];
    const r = resolveTextLooks(looks, null, at(22));
    expect(r.overrides).toEqual({ textColor: '#1', icon: '🌙' });
    expect(r.showing).toEqual(['top', 'night']);
    expect(r.verdicts.get('hot')).toBe('unknown');
    // The key look might overrule it, so it is undecided too.
    expect(r.verdicts.get('bottom')).toBe('unknown');

    // An empty bus is a fact about the wall: the key look is skipped and the
    // bottom one is in effect, exactly as the display renders it.
    const empty = resolveTextLooks(looks, states({}), at(22));
    expect(empty.verdicts.get('hot')).toBe('unknown');
    expect(empty.verdicts.get('bottom')).toBe('showing');
    expect(empty.overrides.borderColor).toBe('#2');
  });
});

describe('collectTextLookKeys', () => {
  it('gathers condition keys, nested groups and tokens in the replacement text', () => {
    const looks: TextLook[] = [
      { id: 'a', when: [{ kind: 'or', conditions: [{ kind: 'state', sourceKey: 'plugin:ha:door', equals: 'open' }, { kind: 'numeric', sourceKey: 'plugin:ha:temp', above: 1 }] }] },
      { id: 'b', when: [{ kind: 'time', startTime: '01:00' }], text: 'Now {weather.temperature|round:0} out' },
    ];
    const keys = new Set<string>();
    collectTextLookKeys(looks, keys);
    expect(Array.from(keys).sort()).toEqual(['plugin:ha:door', 'plugin:ha:temp', 'weather.temperature']);
  });

  it('reads tokens from the expanded text, so a token wrapped around a template variable is found', () => {
    const looks: TextLook[] = [{ id: 'a', when: [], text: '{weather.temperature|default:{{greeting}}}' }];
    const plain = new Set<string>();
    collectTextLookKeys(looks, plain);
    expect(plain.size).toBe(0);
    const expanded = new Set<string>();
    collectTextLookKeys(looks, expanded, (text) => text.replace('{{greeting}}', 'Hello'));
    expect(Array.from(expanded)).toEqual(['weather.temperature']);
  });

  it('tolerates an absent list', () => {
    const keys = new Set<string>();
    collectTextLookKeys(undefined, keys);
    expect(keys.size).toBe(0);
  });
});

describe('textLooksNeedClock', () => {
  it('is true only when a look reads the clock', () => {
    expect(textLooksNeedClock(undefined)).toBe(false);
    expect(textLooksNeedClock(bands)).toBe(false);
    expect(textLooksNeedClock([{ id: 'n', when: [{ kind: 'and', conditions: [{ kind: 'time', startTime: '21:00' }] }] }])).toBe(true);
  });
});

describe('lookSetsAnything', () => {
  it('is false for a rule with only conditions', () => {
    expect(lookSetsAnything({ id: 'a', when: [] })).toBe(false);
    // Blank words are the Show text as switch's starting state, not a change.
    expect(lookSetsAnything({ id: 'a', when: [], text: '' })).toBe(false);
    expect(lookSetsAnything({ id: 'a', when: [], text: 'Warm' })).toBe(true);
    expect(lookSetsAnything({ id: 'a', when: [], opacity: 1 })).toBe(true);
  });
});

describe('applyTextLook', () => {
  const style: ModuleStyle = { ...DEFAULT_MODULE_STYLE, opacity: 0.8, borderWidth: 1 };

  it('returns the same object when nothing style-related applies', () => {
    expect(applyTextLook(style, {})).toBe(style);
    expect(applyTextLook(style, { icon: 'x', text: 'y' })).toBe(style);
  });

  it('overrides the three colors and leaves the rest', () => {
    const next = applyTextLook(style, { textColor: '#1', borderColor: '#2', backgroundColor: '#3' });
    expect(next.textColor).toBe('#1');
    expect(next.borderColor).toBe('#2');
    expect(next.backgroundColor).toBe('#3');
    expect(next.borderWidth).toBe(1);
    expect(next.padding).toBe(style.padding);
  });

  it('gives a borderless card a border when a look colors it', () => {
    const next = applyTextLook({ ...style, borderWidth: 0 }, { borderColor: '#2' });
    expect(next.borderWidth).toBe(2);
  });

  it('multiplies fade with the card\'s own solidity', () => {
    expect(applyTextLook(style, { opacity: 0.5 }).opacity).toBeCloseTo(0.4);
  });
});

describe('lookContentOpacity', () => {
  it('fades the content itself only while the card is blurred, where the wrapper fades the background alone', () => {
    expect(lookContentOpacity({ ...DEFAULT_MODULE_STYLE, backdropBlur: 12 }, { opacity: 0.5 })).toBe(0.5);
    expect(lookContentOpacity({ ...DEFAULT_MODULE_STYLE, backdropBlur: 0 }, { opacity: 0.5 })).toBeUndefined();
    expect(lookContentOpacity({ ...DEFAULT_MODULE_STYLE, backdropBlur: 12 }, { textColor: '#1' })).toBeUndefined();
  });
});

describe('blank words and icons', () => {
  // The editor's Show text as switch starts the words empty under a "Keep the
  // content above" placeholder. A blank that counted as set wiped the words
  // off the wall and, by first-rule-wins, hid the words of every look below.
  const blankWords: TextLook = { id: 'blank', when: [], text: '' };
  const spacesIcon: TextLook = { id: 'spaces', when: [], icon: '  ' };
  const below: TextLook = { id: 'below', when: [], text: 'Warm out', icon: '🌞' };

  it('does not count blank words or a blank icon as something the look sets', () => {
    expect(lookSetsAnything(blankWords)).toBe(false);
    expect(lookSetsAnything(spacesIcon)).toBe(false);
    expect(lookSetsAnything({ ...blankWords, textColor: '#fff' })).toBe(true);
  });

  it('keeps the module content and lets a lower look set the words', () => {
    const r = resolveTextLooks([blankWords, spacesIcon, below], states({}));
    expect(r.overrides.text).toBe('Warm out');
    expect(r.overrides.icon).toBe('🌞');
    expect(r.verdicts.get('blank')).toBe('overruled');
    expect(r.verdicts.get('spaces')).toBe('overruled');
    expect(r.showing).toEqual(['below']);
  });

  it('leaves the words alone when the only matching look has blank words', () => {
    const r = resolveTextLooks([{ ...blankWords, textColor: '#f00' }], states({}));
    expect(r.overrides).toEqual({ textColor: '#f00' });
  });
});
