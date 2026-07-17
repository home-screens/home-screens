import { describe, it, expect } from 'vitest';
import type { VisibilityCondition } from '@/types/config';
import type { StateKeyDescriptor } from '@/types/plugins';
import { convertConditionKind, carryValueList } from '../ConditionTreeEditor';

describe('convertConditionKind', () => {
  it('returns the same object when the kind is unchanged', () => {
    const c: VisibilityCondition = { kind: 'state', sourceKey: 'door', equals: 'open' };
    expect(convertConditionKind(c, 'state', '')).toBe(c);
  });

  it('state → numeric keeps the sourceKey', () => {
    const c: VisibilityCondition = { kind: 'state', sourceKey: 'temp', equals: '70' };
    expect(convertConditionKind(c, 'numeric', 'fallback')).toEqual({ kind: 'numeric', sourceKey: 'temp' });
  });

  it('numeric → state keeps the sourceKey', () => {
    const c: VisibilityCondition = { kind: 'numeric', sourceKey: 'temp', above: 70 };
    expect(convertConditionKind(c, 'state', 'fallback')).toEqual({ kind: 'state', sourceKey: 'temp', equals: '' });
  });

  it('leaf → group wraps the existing leaf as the first child', () => {
    const c: VisibilityCondition = { kind: 'state', sourceKey: 'door', equals: 'open' };
    expect(convertConditionKind(c, 'and', '')).toEqual({ kind: 'and', conditions: [c] });
  });

  it('group → group keeps the children', () => {
    const child: VisibilityCondition = { kind: 'state', sourceKey: 'door', equals: 'open' };
    const c: VisibilityCondition = { kind: 'and', conditions: [child] };
    expect(convertConditionKind(c, 'or', '')).toEqual({ kind: 'or', conditions: [child] });
  });

  it('group → leaf recovers the first leaf descendant sourceKey', () => {
    const c: VisibilityCondition = {
      kind: 'and',
      conditions: [
        { kind: 'not', conditions: [{ kind: 'numeric', sourceKey: 'nested.temp' }] },
      ],
    };
    expect(convertConditionKind(c, 'state', 'fallback')).toEqual({
      kind: 'state', sourceKey: 'nested.temp', equals: '',
    });
  });

  it('group → leaf falls back to defaultKey when no leaf descendant exists', () => {
    // Groups always hold at least one child in the UI, but be defensive.
    const c = { kind: 'and', conditions: [] } as unknown as VisibilityCondition;
    expect(convertConditionKind(c, 'numeric', 'fallback')).toEqual({
      kind: 'numeric', sourceKey: 'fallback',
    });
  });
});

describe('carryValueList', () => {
  const descriptor: Pick<StateKeyDescriptor, 'valueOptions'> = {
    valueOptions: [{ value: 'living room, tv' }, { value: 'kitchen' }],
  };

  it('carries a vocabulary value containing a comma across the toggle intact', () => {
    // The bug: toggling is/is-not comma-split 'living room, tv' into two values,
    // producing a condition that could never match.
    expect(carryValueList('living room, tv', descriptor)).toBe('living room, tv');
  });

  it('still splits genuine free-text lists into matches-any arrays', () => {
    expect(carryValueList('on, off', descriptor)).toEqual(['on', 'off']);
    expect(carryValueList('on, off', null)).toEqual(['on', 'off']);
  });

  it('leaves a single free-text value and an existing array unchanged', () => {
    expect(carryValueList('kitchen', descriptor)).toBe('kitchen');
    expect(carryValueList(['on', 'off'], descriptor)).toEqual(['on', 'off']);
    expect(carryValueList(undefined, descriptor)).toBe('');
  });
});
