import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GO_BACK_AFTER_MS,
  MAX_GO_BACK_AFTER_MS,
  goBackAfterFromMinutes,
  goBackAfterMinutesText,
  openersOf,
  resolveGoBackAfterMs,
  openerNames,
  screenHasOpener,
  showsOnlyWhenOpened,
} from '@/lib/on-demand-screen';
import type { Screen } from '@/types/config';

const screen = (id: string, extra: Partial<Screen> = {}): Screen => ({ id, name: id, backgroundImage: '', modules: [], ...extra });
const mod = (id: string, openButtonScreen?: string): Screen['modules'][number] => ({
  id, type: 'text', position: { x: 0, y: 0 }, size: { w: 100, h: 100 }, zIndex: 1, config: {}, style: {} as Screen['modules'][number]['style'],
  ...(openButtonScreen ? { openButtonScreen } : {}),
});

describe('on-demand screens', () => {
  it('shows only when opened is the rotation choice alone', () => {
    expect(showsOnlyWhenOpened(screen('a'))).toBe(false);
    expect(showsOnlyWhenOpened(screen('a', { rotation: 'turn' }))).toBe(false);
    expect(showsOnlyWhenOpened(screen('a', { rotation: 'opened' }))).toBe(true);
  });

  it('resolves the quiet time with a default, a floor and a zero', () => {
    expect(resolveGoBackAfterMs(screen('a'))).toBe(DEFAULT_GO_BACK_AFTER_MS);
    expect(resolveGoBackAfterMs(screen('a', { goBackAfterMs: 0 }))).toBe(0);
    expect(resolveGoBackAfterMs(screen('a', { goBackAfterMs: 90_000 }))).toBe(90_000);
    expect(resolveGoBackAfterMs(screen('a', { goBackAfterMs: -5 }))).toBe(DEFAULT_GO_BACK_AFTER_MS);
    expect(resolveGoBackAfterMs(screen('a', { goBackAfterMs: Number.NaN }))).toBe(DEFAULT_GO_BACK_AFTER_MS);
  });

  it('turns typed minutes into whole or half minutes within a day, and says what it changed from and to', () => {
    expect(goBackAfterFromMinutes('2')).toEqual({ ms: 120_000, changed: null, from: 2, to: 2 });
    expect(goBackAfterFromMinutes('1.5')).toEqual({ ms: 90_000, changed: null, from: 1.5, to: 1.5 });
    expect(goBackAfterFromMinutes('0')).toEqual({ ms: 0, changed: null, from: 0, to: 0 });
    expect(goBackAfterFromMinutes('1.2')).toEqual({ ms: 60_000, changed: 'rounded', from: 1.2, to: 1 });
    expect(goBackAfterFromMinutes('2.3')).toMatchObject({ ms: 150_000, changed: 'rounded', to: 2.5 });
    expect(goBackAfterFromMinutes('-3')).toEqual({ ms: 0, changed: 'rounded', from: -3, to: 0 });
    expect(goBackAfterFromMinutes('99999')).toEqual({ ms: MAX_GO_BACK_AFTER_MS, changed: 'clamped', from: 99999, to: 1440 });
    expect(goBackAfterFromMinutes('1440')).toMatchObject({ ms: MAX_GO_BACK_AFTER_MS, changed: null });
    expect(goBackAfterFromMinutes('')).toBeNull();
    expect(goBackAfterFromMinutes('abc')).toBeNull();
  });

  it('reads a decimal comma as a decimal point', () => {
    expect(goBackAfterFromMinutes('1,5')).toMatchObject({ ms: 90_000, changed: null });
  });

  it('shows the saved value as the field holds it', () => {
    expect(goBackAfterMinutesText(120_000)).toBe('2');
    expect(goBackAfterMinutesText(90_000)).toBe('1.5');
    expect(goBackAfterMinutesText(0)).toBe('0');
  });

  it('knows whether anything can open a screen: a button, a dock tile, or a rule', () => {
    const kitchen = screen('kitchen', { modules: [mod('meals', 'recipes')] });
    const dock = { ...mod('dock'), type: 'display-control' as const, config: { dockButtons: [{ screenId: 'night' }] } };
    const evening = screen('evening', { modules: [dock] });
    const all = [kitchen, evening, screen('recipes'), screen('night'), screen('alerts'), screen('lonely')];
    const rules = [{ action: { kind: 'showScreen', screenId: 'alerts' } }, { action: { kind: 'wake' } }];
    expect(screenHasOpener(all, rules, 'recipes')).toBe(true);
    expect(screenHasOpener(all, rules, 'night')).toBe(true);
    expect(screenHasOpener(all, rules, 'alerts')).toBe(true);
    expect(screenHasOpener(all, rules, 'lonely')).toBe(false);
    expect(screenHasOpener(all, undefined, 'alerts')).toBe(false);
    // A module with Tap on the Wall off draws no button, so it opens nothing.
    const untappable = { ...mod('meals2', 'lonely'), config: { interactive: false } };
    expect(screenHasOpener([screen('k2', { modules: [untappable] }), screen('lonely')], undefined, 'lonely')).toBe(false);
  });

  it('names the openers for a sentence, counting two of the same once', () => {
    const t = (key: string, v?: Record<string, string | number>) => (key.endsWith('Count') ? `${v?.name} (${v?.count})` : `${v?.module} on ${v?.screen}`);
    const kitchen = screen('kitchen', { name: 'Kitchen', modules: [mod('a', 'recipes'), mod('b', 'recipes')] });
    const evening = screen('evening', { name: 'Evening', modules: [mod('c', 'recipes')] });
    expect(openerNames([kitchen, evening], 'recipes', () => 'Text', t)).toEqual(['Text on Kitchen (2)', 'Text on Evening']);
  });

  it('finds the modules whose button opens a screen', () => {
    const kitchen = screen('kitchen', { modules: [mod('clock'), mod('meals', 'recipes')] });
    const evening = screen('evening', { modules: [mod('cal', 'recipes'), mod('other', 'kitchen')] });
    const found = openersOf([kitchen, evening, screen('recipes')], 'recipes');
    expect(found.map((o) => [o.screen.id, o.module.id])).toEqual([['kitchen', 'meals'], ['evening', 'cal']]);
    expect(openersOf([kitchen, evening], 'nowhere')).toEqual([]);
  });
});
