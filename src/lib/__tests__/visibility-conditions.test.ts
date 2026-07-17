import { describe, it, expect } from 'vitest';
import type { ModuleInstance, ModuleVisibility } from '@/types/config';
import type { SharedStateEntry } from '../shared-state-types';
import {
  evaluateVisibility,
  evaluateConditionsTri,
  collectConditionSourceKeys,
  collectSourceKeys,
  containsTimeCondition,
} from '../schedule';

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

    it('an incomplete condition (empty sourceKey) gates on whenUnknown', () => {
      // The editor saves new conditions blank while the user picks a key —
      // an empty key can never be published, so it is permanently unknown.
      const v = vis({ conditions: [{ kind: 'state', sourceKey: '', equals: '' }] });
      expect(evaluateVisibility(v, states({ door: 'open' }))).toBe(false);
      expect(evaluateVisibility(
        vis({ conditions: [{ kind: 'state', sourceKey: '', equals: '' }], whenUnknown: 'show' }),
        states({}),
      )).toBe(true);
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

describe('time conditions', () => {
  // 2026-03-09 is a Monday. Build a wall-clock Date for a given day/time.
  // day: 0=Sun … 6=Sat, anchored on the Sunday 2026-03-08.
  const at = (day: number, h: number, m = 0) => new Date(2026, 2, 8 + day, h, m);

  it('matches inside a same-day window and fails outside it', () => {
    const v = vis({ conditions: [{ kind: 'time', startTime: '07:00', endTime: '21:00' }] });
    expect(evaluateVisibility(v, states({}), at(1, 12))).toBe(true);
    expect(evaluateVisibility(v, states({}), at(1, 6))).toBe(false);
    expect(evaluateVisibility(v, states({}), at(1, 21))).toBe(false); // end is exclusive
  });

  it('handles an overnight window that wraps past midnight', () => {
    const v = vis({ conditions: [{ kind: 'time', startTime: '22:00', endTime: '06:00' }] });
    expect(evaluateVisibility(v, states({}), at(1, 23))).toBe(true);
    expect(evaluateVisibility(v, states({}), at(1, 2))).toBe(true);
    expect(evaluateVisibility(v, states({}), at(1, 12))).toBe(false);
  });

  it('filters by day of week', () => {
    const v = vis({ conditions: [{ kind: 'time', daysOfWeek: [1, 2, 3, 4, 5] }] });
    expect(evaluateVisibility(v, states({}), at(1, 12))).toBe(true); // Monday
    expect(evaluateVisibility(v, states({}), at(0, 12))).toBe(false); // Sunday
  });

  it('is always true when every field is absent', () => {
    const v = vis({ conditions: [{ kind: 'time' }] });
    expect(evaluateVisibility(v, states({}), at(0, 3))).toBe(true);
    expect(evaluateVisibility(v, states({}), at(3, 18))).toBe(true);
  });

  it('AND-combines with a state condition without tripping whenUnknown', () => {
    // The state key is unpublished, so whenUnknown governs — a time condition
    // must not itself make the tree "unknown".
    const v = vis({
      whenUnknown: 'show',
      conditions: [
        { kind: 'time', startTime: '07:00', endTime: '21:00' },
        { kind: 'state', sourceKey: 'door', equals: 'open' },
      ],
    });
    // Unpublished door → whenUnknown 'show' wins regardless of the clock.
    expect(evaluateVisibility(v, states({}), at(1, 12))).toBe(true);
    // Published door=open + inside the window → both met.
    expect(evaluateVisibility(v, states({ door: 'open' }), at(1, 12))).toBe(true);
    // Published door=open but outside the window → time condition fails it.
    expect(evaluateVisibility(v, states({ door: 'open' }), at(1, 3))).toBe(false);
  });

  it('is a definite boolean through the tri evaluator, never unknown', () => {
    const inside = evaluateConditionsTri(
      [{ kind: 'time', startTime: '07:00', endTime: '21:00' }], states({}), at(1, 12));
    const outside = evaluateConditionsTri(
      [{ kind: 'time', startTime: '07:00', endTime: '21:00' }], states({}), at(1, 3));
    expect(inside).toBe(true);
    expect(outside).toBe(false);
  });

  it('lets a live state key stay unknown alongside a time condition (tri)', () => {
    // "unknown door" OR-free AND-tree: an unpublished key is still unknown,
    // proving the time branch does not launder the whole tree into definite.
    const tri = evaluateConditionsTri(
      [
        { kind: 'time', startTime: '00:00', endTime: '23:59' },
        { kind: 'state', sourceKey: 'door', equals: 'open' },
      ],
      states({}),
      at(1, 12),
    );
    expect(tri).toBeUndefined();
  });

  it('contributes no source keys to the demand set', () => {
    const into = new Set<string>();
    collectSourceKeys(
      [{ kind: 'and', conditions: [
        { kind: 'time', startTime: '07:00', endTime: '21:00' },
        { kind: 'state', sourceKey: 'door', equals: 'open' },
      ] }],
      into,
    );
    expect(Array.from(into)).toEqual(['door']);
  });

  it('containsTimeCondition finds time conditions at any depth', () => {
    expect(containsTimeCondition([{ kind: 'state', sourceKey: 'x', equals: 'y' }])).toBe(false);
    expect(containsTimeCondition([{ kind: 'time' }])).toBe(true);
    expect(containsTimeCondition([
      { kind: 'or', conditions: [
        { kind: 'state', sourceKey: 'x', equals: 'y' },
        { kind: 'not', conditions: [{ kind: 'time', startTime: '07:00' }] },
      ] },
    ])).toBe(true);
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
