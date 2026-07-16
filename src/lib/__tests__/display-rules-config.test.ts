import { describe, it, expect } from 'vitest';
import type { DisplayRule, Screen, ScreenConfiguration } from '@/types/config';
import {
  MAX_RULES_PER_DISPLAY,
  pruneDanglingScreenRefs,
  validateAllSchedules,
  validateDisplayRules,
} from '@/lib/display-filter';
import { getActiveRules, withRules } from '@/lib/editor-multi-display';
import { collectDemandedKeys } from '@/lib/state-demand';

function makeScreen(id: string): Screen {
  return { id, name: id, backgroundImage: '', modules: [] };
}

function makeRule(overrides: Partial<DisplayRule> & { id: string }): DisplayRule {
  return {
    name: overrides.id,
    when: [{ kind: 'state', sourceKey: 'plugin:ha:door', equals: 'on' }],
    action: { kind: 'showScreen', screenId: 'cameras', mode: 'for', seconds: 60 },
    ...overrides,
  };
}

const SCREENS = [makeScreen('home'), makeScreen('cameras')];

function makeConfig(overrides: Partial<ScreenConfiguration> = {}): ScreenConfiguration {
  return {
    version: 5,
    settings: {} as ScreenConfiguration['settings'],
    screens: SCREENS,
    ...overrides,
  };
}

describe('validateDisplayRules', () => {
  it('accepts undefined, an empty list, and a well-formed rule', () => {
    expect(validateDisplayRules(undefined, SCREENS, 'config')).toBeNull();
    expect(validateDisplayRules([], SCREENS, 'config')).toBeNull();
    expect(validateDisplayRules([makeRule({ id: 'r' })], SCREENS, 'config')).toBeNull();
  });

  it('accepts a wake action and a while-mode action without seconds', () => {
    expect(validateDisplayRules([makeRule({ id: 'r', action: { kind: 'wake' } })], SCREENS, 'config')).toBeNull();
    expect(validateDisplayRules(
      [makeRule({ id: 'r', action: { kind: 'showScreen', screenId: 'home', mode: 'while' } })],
      SCREENS, 'config',
    )).toBeNull();
  });

  it('allows an empty screenId as an incomplete-but-saveable rule', () => {
    const rule = makeRule({ id: 'r', action: { kind: 'showScreen', screenId: '', mode: 'for', seconds: 5 } });
    expect(validateDisplayRules([rule], SCREENS, 'config')).toBeNull();
  });

  it('rejects missing/duplicate ids, unknown screens, bad modes, and bad seconds', () => {
    expect(validateDisplayRules([makeRule({ id: '' })], SCREENS, 'config')).toMatch(/missing id/);
    expect(validateDisplayRules([makeRule({ id: 'r' }), makeRule({ id: 'r' })], SCREENS, 'config')).toMatch(/duplicate rule id/);
    expect(validateDisplayRules(
      [makeRule({ id: 'r', action: { kind: 'showScreen', screenId: 'nope', mode: 'while' } })],
      SCREENS, 'config',
    )).toMatch(/unknown screen "nope"/);
    expect(validateDisplayRules(
      [makeRule({ id: 'r', action: { kind: 'showScreen', screenId: 'home', mode: 'sometimes' as 'while' } })],
      SCREENS, 'config',
    )).toMatch(/mode must be/);
    expect(validateDisplayRules(
      [makeRule({ id: 'r', action: { kind: 'showScreen', screenId: 'home', mode: 'for' } })],
      SCREENS, 'config',
    )).toMatch(/seconds must be a positive number/);
    expect(validateDisplayRules(
      [makeRule({ id: 'r', action: { kind: 'showScreen', screenId: 'home', mode: 'for', seconds: 0 } })],
      SCREENS, 'config',
    )).toMatch(/seconds must be a positive number/);
  });

  it('rejects unknown action kinds and negative cooldowns', () => {
    expect(validateDisplayRules(
      [makeRule({ id: 'r', action: { kind: 'reboot' } as unknown as DisplayRule['action'] })],
      SCREENS, 'config',
    )).toMatch(/unknown action kind/);
    expect(validateDisplayRules([makeRule({ id: 'r', cooldownSeconds: -5 })], SCREENS, 'config')).toMatch(/cooldownSeconds/);
  });

  it('validates the condition tree with the shared visibility validator', () => {
    const bad = makeRule({
      id: 'r',
      when: [{ kind: 'state', sourceKey: 'UPPER CASE BAD', equals: 'on' }],
    });
    expect(validateDisplayRules([bad], SCREENS, 'config')).toMatch(/sourceKey/);
  });

  it('caps the number of rules per display', () => {
    const many = Array.from({ length: MAX_RULES_PER_DISPLAY + 1 }, (_, i) => makeRule({ id: `r${i}` }));
    expect(validateDisplayRules(many, SCREENS, 'config')).toMatch(/too many rules/);
  });
});

describe('validateAllSchedules — rules integration', () => {
  it('validates legacy config.rules against config.screens', () => {
    const config = makeConfig({ rules: [makeRule({ id: 'r', action: { kind: 'showScreen', screenId: 'nope', mode: 'while' } })] });
    expect(validateAllSchedules(config)).toMatch(/unknown screen/);
  });

  it('validates display.rules against that display\'s own screens', () => {
    const config = makeConfig({
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('k1')],
        rules: [makeRule({ id: 'r', action: { kind: 'showScreen', screenId: 'cameras', mode: 'while' } })],
      }],
    });
    // 'cameras' exists globally but NOT on the kitchen display — rejected.
    expect(validateAllSchedules(config)).toMatch(/display "kitchen".*unknown screen "cameras"/);
  });

  it('passes a healthy multi-display config with rules', () => {
    const config = makeConfig({
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [makeScreen('k1')],
        rules: [makeRule({ id: 'r', action: { kind: 'showScreen', screenId: 'k1', mode: 'for', seconds: 30 } })],
      }],
    });
    expect(validateAllSchedules(config)).toBeNull();
  });
});

describe('pruneDanglingScreenRefs — rule targets', () => {
  it('blanks legacy rule targets pointing at the deleted screen', () => {
    const config = makeConfig({
      rules: [makeRule({ id: 'r' }), makeRule({ id: 'keep', action: { kind: 'wake' } })],
    });
    const next = pruneDanglingScreenRefs(config, 'cameras', null);
    expect(next.rules?.[0].action).toEqual({ kind: 'showScreen', screenId: '', mode: 'for', seconds: 60 });
    expect(next.rules?.[1].action).toEqual({ kind: 'wake' });
    // The pruned config passes the write gate.
    expect(validateAllSchedules({ ...next, screens: [makeScreen('home')] })).toBeNull();
  });

  it('blanks the selected display\'s rule targets only', () => {
    const kitchenRule = makeRule({ id: 'kr', action: { kind: 'showScreen', screenId: 'k1', mode: 'while' } });
    const config = makeConfig({
      displays: [
        { id: 'kitchen', name: 'Kitchen', screens: [makeScreen('k1')], rules: [kitchenRule] },
        { id: 'den', name: 'Den', screens: [makeScreen('k1')], rules: [makeRule({ id: 'dr', action: { kind: 'showScreen', screenId: 'k1', mode: 'while' } })] },
      ],
    });
    const next = pruneDanglingScreenRefs(config, 'k1', 'kitchen');
    const kitchen = next.displays!.find((d) => d.id === 'kitchen')!;
    const den = next.displays!.find((d) => d.id === 'den')!;
    expect((kitchen.rules![0].action as { screenId: string }).screenId).toBe('');
    expect((den.rules![0].action as { screenId: string }).screenId).toBe('k1');
  });
});

describe('getActiveRules / withRules ownership', () => {
  const legacyRule = makeRule({ id: 'legacy' });
  const kitchenRule = makeRule({ id: 'kitchen-rule', action: { kind: 'wake' } });

  it('targets config.rules in legacy mode and display.rules when a display is selected', () => {
    const config = makeConfig({
      rules: [legacyRule],
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [], rules: [kitchenRule] }],
    });

    expect(getActiveRules(config, null).map((r) => r.id)).toEqual(['legacy']);
    expect(getActiveRules(config, 'kitchen').map((r) => r.id)).toEqual(['kitchen-rule']);
    // Unknown display falls back to the legacy list (same posture as getActiveScreens).
    expect(getActiveRules(config, 'ghost').map((r) => r.id)).toEqual(['legacy']);

    const nextLegacy = withRules(config, null, (rules) => [...rules, makeRule({ id: 'new' })]);
    expect(nextLegacy.rules!.map((r) => r.id)).toEqual(['legacy', 'new']);
    expect(nextLegacy.displays![0].rules!.map((r) => r.id)).toEqual(['kitchen-rule']);

    const nextKitchen = withRules(config, 'kitchen', (rules) => rules.filter((r) => r.id !== 'kitchen-rule'));
    expect(nextKitchen.displays![0].rules).toEqual([]);
    expect(nextKitchen.rules!.map((r) => r.id)).toEqual(['legacy']);
  });

  it('creates the rules array on first write for a display without one', () => {
    const config = makeConfig({
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
    });
    const next = withRules(config, 'kitchen', (rules) => [...rules, makeRule({ id: 'first' })]);
    expect(next.displays![0].rules!.map((r) => r.id)).toEqual(['first']);
    expect(next.rules).toBeUndefined();
  });
});

describe('collectDemandedKeys — rules', () => {
  it('includes enabled rule keys and skips disabled rules', () => {
    const demanded = collectDemandedKeys([], [
      makeRule({ id: 'a' }),
      makeRule({ id: 'b', enabled: false, when: [{ kind: 'state', sourceKey: 'plugin:ha:skip_me', equals: 'x' }] }),
    ]);
    expect(demanded).toEqual(new Set(['plugin:ha:door']));
  });
});
