import { describe, expect, it } from 'vitest';
import { canOpenWithCard, openWith } from '@/lib/open-button';
import { getAllModuleDefinitions } from '@/lib/module-registry';

describe('canOpenWithCard', () => {
  it('allows read-only cards', () => {
    for (const type of ['weather', 'clock', 'countdown', 'text', 'image', 'sports'] as const) {
      expect(canOpenWithCard(type)).toBe(true);
    }
  });

  it('refuses every type that takes taps of its own', () => {
    for (const type of ['calendar', 'todo', 'chore-chart', 'meal-planner', 'news', 'multi-month', 'photo-slideshow', 'fullscreen-photo', 'iframe', 'display-control'] as const) {
      expect(canOpenWithCard(type)).toBe(false);
    }
  });

  it('refuses plugins and unknown types', () => {
    expect(canOpenWithCard('plugin:anything')).toBe(false);
    expect(canOpenWithCard('no-such-module' as never)).toBe(false);
  });

  it('follows the registry flag for every built-in', () => {
    for (const def of getAllModuleDefinitions()) {
      expect(canOpenWithCard(def.type)).toBe(!def.takesTaps);
    }
  });
});

describe('openWith', () => {
  it('is the button unless the card is asked for and allowed', () => {
    expect(openWith({ type: 'weather' })).toBe('button');
    expect(openWith({ type: 'weather', openWith: 'button' })).toBe('button');
    expect(openWith({ type: 'weather', openWith: 'card' })).toBe('card');
    expect(openWith({ type: 'calendar', openWith: 'card' })).toBe('button');
    expect(openWith({ type: 'plugin:x', openWith: 'card' })).toBe('button');
  });
});
