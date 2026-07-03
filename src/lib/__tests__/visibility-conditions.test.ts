import { describe, it, expect } from 'vitest';
import type { ModuleInstance, ModuleVisibility } from '@/types/config';
import type { SharedStateEntry } from '../shared-state-types';
import { evaluateVisibility, collectConditionSourceKeys } from '../schedule';

function states(entries: Record<string, string>): ReadonlyMap<string, SharedStateEntry> {
  return new Map(
    Object.entries(entries).map(([k, v]) => [k, { value: v, updatedAt: 0 }]),
  );
}

const vis = (v: Omit<ModuleVisibility, 'conditions'> & Partial<ModuleVisibility>): ModuleVisibility =>
  ({ conditions: [], ...v });

describe('evaluateVisibility', () => {
  it('is visible with no visibility or empty conditions', () => {
    expect(evaluateVisibility(undefined, states({}))).toBe(true);
    expect(evaluateVisibility(vis({ conditions: [] }), states({}))).toBe(true);
  });

  describe('state conditions', () => {
    it('equals matches a single string', () => {
      const v = vis({ conditions: [{ kind: 'state', sourceKey: 'door', equals: 'alert' }] });
      expect(evaluateVisibility(v, states({ door: 'alert' }))).toBe(true);
      expect(evaluateVisibility(v, states({ door: 'closed' }))).toBe(false);
    });

    it('equals with an array means "matches any"', () => {
      const v = vis({ conditions: [{ kind: 'state', sourceKey: 'door', equals: ['open', 'alert'] }] });
      expect(evaluateVisibility(v, states({ door: 'open' }))).toBe(true);
      expect(evaluateVisibility(v, states({ door: 'alert' }))).toBe(true);
      expect(evaluateVisibility(v, states({ door: 'closed' }))).toBe(false);
    });

    it('notEquals hides on match', () => {
      const v = vis({ conditions: [{ kind: 'state', sourceKey: 'door', notEquals: 'closed' }] });
      expect(evaluateVisibility(v, states({ door: 'open' }))).toBe(true);
      expect(evaluateVisibility(v, states({ door: 'closed' }))).toBe(false);
    });

    it('notEquals with an array hides on any match', () => {
      const v = vis({ conditions: [{ kind: 'state', sourceKey: 'door', notEquals: ['closed', 'locked'] }] });
      expect(evaluateVisibility(v, states({ door: 'locked' }))).toBe(false);
      expect(evaluateVisibility(v, states({ door: 'ajar' }))).toBe(true);
    });
  });

  describe('numeric conditions', () => {
    it('applies strict above/below bounds', () => {
      const v = vis({ conditions: [{ kind: 'numeric', sourceKey: 'temp', above: 60, below: 80 }] });
      expect(evaluateVisibility(v, states({ temp: '70' }))).toBe(true);
      expect(evaluateVisibility(v, states({ temp: '60' }))).toBe(false); // strict
      expect(evaluateVisibility(v, states({ temp: '80' }))).toBe(false); // strict
      expect(evaluateVisibility(v, states({ temp: '90' }))).toBe(false);
    });

    it('works with only one bound', () => {
      const above = vis({ conditions: [{ kind: 'numeric', sourceKey: 'temp', above: 32 }] });
      expect(evaluateVisibility(above, states({ temp: '33' }))).toBe(true);
      expect(evaluateVisibility(above, states({ temp: '-5' }))).toBe(false);
    });

    it('a published non-numeric value makes the condition false', () => {
      const v = vis({ conditions: [{ kind: 'numeric', sourceKey: 'temp', above: 0 }] });
      expect(evaluateVisibility(v, states({ temp: 'unavailable' }))).toBe(false);
      expect(evaluateVisibility(v, states({ temp: '' }))).toBe(false);
    });
  });

  describe('boolean combinators', () => {
    it('and requires all children', () => {
      const v = vis({
        conditions: [{
          kind: 'and',
          conditions: [
            { kind: 'state', sourceKey: 'door', equals: 'open' },
            { kind: 'numeric', sourceKey: 'temp', above: 50 },
          ],
        }],
      });
      expect(evaluateVisibility(v, states({ door: 'open', temp: '60' }))).toBe(true);
      expect(evaluateVisibility(v, states({ door: 'open', temp: '40' }))).toBe(false);
    });

    it('or requires any child', () => {
      const v = vis({
        conditions: [{
          kind: 'or',
          conditions: [
            { kind: 'state', sourceKey: 'door', equals: 'open' },
            { kind: 'state', sourceKey: 'window', equals: 'open' },
          ],
        }],
      });
      expect(evaluateVisibility(v, states({ door: 'closed', window: 'open' }))).toBe(true);
      expect(evaluateVisibility(v, states({ door: 'closed', window: 'closed' }))).toBe(false);
    });

    it('not is true when none of its conditions are met', () => {
      const v = vis({
        conditions: [{
          kind: 'not',
          conditions: [{ kind: 'state', sourceKey: 'door', equals: 'closed' }],
        }],
      });
      expect(evaluateVisibility(v, states({ door: 'open' }))).toBe(true);
      expect(evaluateVisibility(v, states({ door: 'closed' }))).toBe(false);
    });

    it('supports nesting (or inside and)', () => {
      const v = vis({
        conditions: [{
          kind: 'and',
          conditions: [
            { kind: 'state', sourceKey: 'mode', equals: 'home' },
            {
              kind: 'or',
              conditions: [
                { kind: 'state', sourceKey: 'door', equals: 'open' },
                { kind: 'state', sourceKey: 'window', equals: 'open' },
              ],
            },
          ],
        }],
      });
      expect(evaluateVisibility(v, states({ mode: 'home', door: 'closed', window: 'open' }))).toBe(true);
      expect(evaluateVisibility(v, states({ mode: 'away', door: 'open', window: 'open' }))).toBe(false);
    });
  });

  describe('top-level array semantics', () => {
    it('ANDs all top-level conditions together', () => {
      const v = vis({
        conditions: [
          { kind: 'state', sourceKey: 'door', equals: 'open' },
          { kind: 'numeric', sourceKey: 'temp', above: 50 },
        ],
      });
      expect(evaluateVisibility(v, states({ door: 'open', temp: '60' }))).toBe(true);
      expect(evaluateVisibility(v, states({ door: 'closed', temp: '60' }))).toBe(false);
    });
  });

  describe('whenUnknown gate', () => {
    it('any unpublished key returns the whenUnknown outcome (default hide)', () => {
      const v = vis({ conditions: [{ kind: 'state', sourceKey: 'missing', equals: 'x' }] });
      expect(evaluateVisibility(v, states({}))).toBe(false);
    });

    it('whenUnknown: show makes unpublished keys visible', () => {
      const v = vis({
        conditions: [{ kind: 'state', sourceKey: 'missing', equals: 'x' }],
        whenUnknown: 'show',
      });
      expect(evaluateVisibility(v, states({}))).toBe(true);
    });

    it('a known key ANDed with an unknown one still gates on whenUnknown', () => {
      const v = vis({
        conditions: [
          { kind: 'state', sourceKey: 'known', equals: 'yes' },
          { kind: 'state', sourceKey: 'missing', equals: 'x' },
        ],
      });
      // 'known' would evaluate true, but the unknown key short-circuits to hide
      expect(evaluateVisibility(v, states({ known: 'yes' }))).toBe(false);
    });

    it('an unknown key nested inside not gates BEFORE negation', () => {
      const v = vis({
        conditions: [{
          kind: 'not',
          conditions: [{ kind: 'state', sourceKey: 'missing', equals: 'x' }],
        }],
      });
      // Without the all-or-nothing gate, not(unknown-leaf=false) would flip to
      // visible; the gate keeps the default outcome at hide.
      expect(evaluateVisibility(v, states({}))).toBe(false);
    });

    it('an unknown key inside or gates even when a sibling branch is known-true', () => {
      const v = vis({
        conditions: [{
          kind: 'or',
          conditions: [
            { kind: 'state', sourceKey: 'known', equals: 'yes' },
            { kind: 'state', sourceKey: 'missing', equals: 'x' },
          ],
        }],
      });
      // All-or-nothing: the or is never evaluated while any referenced key is
      // unknown, so the known-true branch cannot rescue it from the gate.
      expect(evaluateVisibility(v, states({ known: 'yes' }))).toBe(false);
    });
  });

  describe('edge combinations', () => {
    it('equals and notEquals together must BOTH pass', () => {
      const v = vis({
        conditions: [{ kind: 'state', sourceKey: 'door', equals: ['open', 'alert'], notEquals: 'alert' }],
      });
      expect(evaluateVisibility(v, states({ door: 'open' }))).toBe(true);
      expect(evaluateVisibility(v, states({ door: 'alert' }))).toBe(false);
      expect(evaluateVisibility(v, states({ door: 'closed' }))).toBe(false);
    });

    it('numeric with no bounds passes for any numeric value, fails otherwise', () => {
      const v = vis({ conditions: [{ kind: 'numeric', sourceKey: 'temp' }] });
      expect(evaluateVisibility(v, states({ temp: '72' }))).toBe(true);
      expect(evaluateVisibility(v, states({ temp: '-3.5' }))).toBe(true);
      expect(evaluateVisibility(v, states({ temp: 'warm' }))).toBe(false);
      expect(evaluateVisibility(v, states({ temp: '' }))).toBe(false);
    });
  });
});

describe('collectConditionSourceKeys', () => {
  const mod = (visibility?: ModuleVisibility): ModuleInstance =>
    ({ id: 'm', visibility } as unknown as ModuleInstance);

  it('returns an empty array for modules without conditions', () => {
    expect(collectConditionSourceKeys([mod(), mod({ conditions: [] })])).toEqual([]);
  });

  it('collects keys from nested groups, deduped and sorted', () => {
    const modules = [
      mod({
        conditions: [{
          kind: 'or',
          conditions: [
            { kind: 'state', sourceKey: 'zeta', equals: 'x' },
            { kind: 'not', conditions: [{ kind: 'numeric', sourceKey: 'alpha' }] },
          ],
        }],
      }),
      mod({ conditions: [{ kind: 'state', sourceKey: 'zeta', equals: 'y' }] }),
    ];
    expect(collectConditionSourceKeys(modules)).toEqual(['alpha', 'zeta']);
  });
});
