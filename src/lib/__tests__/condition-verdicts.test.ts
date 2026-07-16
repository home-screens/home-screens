import { describe, it, expect } from 'vitest';
import type { VisibilityCondition } from '@/types/config';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import {
  SNAPSHOT_FRESH_MS,
  conditionVerdict,
  conditionsVerdict,
  explainVisibility,
  snapshotStates,
} from '../condition-verdicts';

const NOW = 1_700_000_000_000;

function entries(values: Record<string, string>): Record<string, SharedStateEntry> {
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, { value: v, updatedAt: NOW }]),
  );
}

function states(values: Record<string, string>): ReadonlyMap<string, SharedStateEntry> {
  return new Map(Object.entries(entries(values)));
}

function stateCondition(sourceKey: string, equals = 'on'): VisibilityCondition {
  return { kind: 'state', sourceKey, equals };
}

describe('snapshotStates', () => {
  it('returns null when there is no snapshot or the display never reported', () => {
    expect(snapshotStates(undefined, NOW)).toBeNull();
    expect(snapshotStates({ entries: {}, reportedAt: null }, NOW)).toBeNull();
  });

  it('returns null for a report older than the freshness window — never a stale verdict', () => {
    const snapshot = { entries: entries({ 'plugin:ha:door': 'on' }), reportedAt: NOW - SNAPSHOT_FRESH_MS - 1 };
    expect(snapshotStates(snapshot, NOW)).toBeNull();
  });

  it('converts a fresh snapshot into the evaluator map', () => {
    const snapshot = { entries: entries({ 'plugin:ha:door': 'on' }), reportedAt: NOW - 5_000 };
    const map = snapshotStates(snapshot, NOW);
    expect(map?.get('plugin:ha:door')?.value).toBe('on');
  });

  it('tolerates clock skew — a server-ahead reportedAt is fresh', () => {
    const snapshot = { entries: entries({ k: 'v' }), reportedAt: NOW + 30_000 };
    expect(snapshotStates(snapshot, NOW)).not.toBeNull();
  });
});

describe('conditionVerdict / conditionsVerdict', () => {
  it('reports met / unmet for a known key', () => {
    const s = states({ 'plugin:ha:door': 'on' });
    expect(conditionVerdict(stateCondition('plugin:ha:door'), s)).toBe('met');
    expect(conditionVerdict(stateCondition('plugin:ha:door', 'off'), s)).toBe('unmet');
  });

  it('reports unknown for an unpublished key, including the empty authoring key', () => {
    const s = states({});
    expect(conditionVerdict(stateCondition('plugin:ha:door'), s)).toBe('unknown');
    expect(conditionVerdict(stateCondition(''), s)).toBe('unknown');
  });

  it('uses Kleene semantics for groups — a known-true or-branch beats an unknown sibling', () => {
    const s = states({ 'plugin:ha:smoke': 'on' });
    const or: VisibilityCondition = {
      kind: 'or',
      conditions: [stateCondition('plugin:ha:smoke'), stateCondition('plugin:ha:co')],
    };
    expect(conditionVerdict(or, s)).toBe('met');
  });

  it('ANDs a condition list: any unmet wins over unknown', () => {
    const s = states({ 'plugin:ha:door': 'off' });
    expect(
      conditionsVerdict([stateCondition('plugin:ha:door'), stateCondition('plugin:ha:missing')], s),
    ).toBe('unmet');
    expect(
      conditionsVerdict([stateCondition('plugin:ha:door', 'off'), stateCondition('plugin:ha:missing')], s),
    ).toBe('unknown');
  });
});

describe('explainVisibility', () => {
  it('mirrors evaluateVisibility for fully-known trees', () => {
    const s = states({ 'plugin:ha:door': 'on' });
    expect(explainVisibility({ conditions: [stateCondition('plugin:ha:door')] }, s)).toEqual({
      visible: true,
      unknownKeys: [],
    });
    expect(explainVisibility({ conditions: [stateCondition('plugin:ha:door', 'off')] }, s)).toEqual({
      visible: false,
      unknownKeys: [],
    });
  });

  it('lists every missing key (sorted) and returns the whenUnknown outcome', () => {
    const s = states({ 'plugin:ha:door': 'on' });
    const visibility = {
      conditions: [
        stateCondition('plugin:ha:door'),
        {
          kind: 'and' as const,
          conditions: [stateCondition('plugin:ha:zzz'), stateCondition('plugin:ha:aaa')],
        },
      ],
    };
    expect(explainVisibility(visibility, s)).toEqual({
      visible: false,
      unknownKeys: ['plugin:ha:aaa', 'plugin:ha:zzz'],
    });
    expect(explainVisibility({ ...visibility, whenUnknown: 'show' as const }, s)).toEqual({
      visible: true,
      unknownKeys: ['plugin:ha:aaa', 'plugin:ha:zzz'],
    });
  });

  it('includes the empty authoring key among unknown keys', () => {
    const explained = explainVisibility({ conditions: [stateCondition('')] }, states({}));
    expect(explained.unknownKeys).toEqual(['']);
    expect(explained.visible).toBe(false);
  });
});
