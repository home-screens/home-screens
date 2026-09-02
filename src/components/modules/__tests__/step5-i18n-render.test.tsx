// @vitest-environment jsdom

/**
 * Render-time i18n contract test for Step 5 (long-tail module sweep).
 *
 * Spec compliance reviewers verify "keys exist + parity + types ok" but they
 * don't always catch a lookup PATH that doesn't match the dictionary
 * PLACEMENT — `t()` returns the raw key string on miss, so a typo silently
 * leaks dotted-path text into the DOM. This test mounts representative
 * modules from each new namespace under both locales and asserts:
 *   1. The expected translated string actually renders.
 *   2. No raw `modules.<namespace>.` dotted-path key leaks into the DOM.
 *
 * Picks modules with synchronous render paths (empty/loading states) so we
 * don't need to mock fetch behavior for every module surface.
 *
 * Establishes the convention for `src/components/modules/__tests__/`
 * recommended by the Step 5 / Step 6 lessons-learned ladder.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';

// jsdom doesn't ship ResizeObserver; modules using `useScaledFontSize` need it.
class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import enUSModules from '@/translations/en-US/modules.json';
import deDEModules from '@/translations/de-DE/modules.json';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type {
  GarbageDayConfig,
  GreetingConfig,
  TodoConfig,
  TrafficConfig,
} from '@/types/config';

import TodoModule from '../TodoModule';
import GreetingModule from '../GreetingModule';
import TrafficModule from '../TrafficModule';
import GarbageDayModule from '../GarbageDayModule';

// On a missed lookup, `useTranslate('modules')` returns the BARE key (e.g.
// `garbage-day.header`) — never `modules.<...>`. Anchoring on `modules.`
// would make this regex unfireable, defeating the safety net. Match the
// bare namespace.subkey shape instead, with a trailing alpha char so that
// non-key dotted text (e.g. "12.5%") doesn't false-positive.
const RAW_KEY_PATTERN = /\b(garbage-day|traffic|todo|greeting|stock-ticker|crypto|todoist|news|history|word-of-day|dad-joke|quote|affirmations|sports|standings|fullscreen-photo)\.[a-zA-Z]/;

function withProvider(locale: 'en-US' | 'de-DE', children: React.ReactNode) {
  const blob = locale === 'en-US' ? { modules: enUSModules } : { modules: deDEModules };
  return (
    <I18nProvider locale={locale} blob={blob}>
      {children}
    </I18nProvider>
  );
}

const emptyTodoConfig: TodoConfig = {
  title: '',
  items: [],
};

const greetingConfig: GreetingConfig = {
  name: 'Test',
  weatherAware: false,
};

const noRoutesTrafficConfig: TrafficConfig = {
  routes: [],
  refreshIntervalMs: 300000,
} as TrafficConfig;

const garbageConfig: GarbageDayConfig = {
  trashDay: 1,
  trashFrequency: 'weekly',
  trashStartDate: '',
  trashColor: '#6ee7b7',
  recyclingDay: 1,
  recyclingFrequency: 'weekly',
  recyclingStartDate: '',
  recyclingColor: '#93c5fd',
  customDay: -1,
  customFrequency: 'weekly',
  customStartDate: '',
  customColor: '#fbbf24',
  customLabel: '',
  highlightMode: 'day-of',
};

describe('Step 5 module i18n render contract', () => {
  beforeEach(() => {
    __resetLoaderForTests();
  });

  afterEach(() => {
    cleanup();
  });

  describe('TodoModule empty state', () => {
    it('renders English copy under en-US', () => {
      const { container } = render(
        withProvider('en-US', <TodoModule config={emptyTodoConfig} style={DEFAULT_MODULE_STYLE} />),
      );
      expect(container.textContent).toContain('Add tasks in the editor and they show up here');
      expect(container.textContent ?? '').not.toMatch(RAW_KEY_PATTERN);
    });

    it('renders German copy under de-DE', () => {
      const { container } = render(
        withProvider('de-DE', <TodoModule config={emptyTodoConfig} style={DEFAULT_MODULE_STYLE} />),
      );
      expect(container.textContent).toContain('Füge im Editor Aufgaben hinzu, dann erscheinen sie hier');
      expect(container.textContent ?? '').not.toMatch(RAW_KEY_PATTERN);
    });
  });

  describe('GreetingModule', () => {
    // Greeting branches on hour-of-day; we don't mock the clock, so the test
    // asserts that one of the four time-of-day greetings renders translated
    // (not the raw key). Whichever branch fires is locale-correct.
    const enGreetings = ['Good morning', 'Good afternoon', 'Good evening', 'Good night'];
    const deGreetings = ['Guten Morgen', 'Guten Tag', 'Guten Abend', 'Gute Nacht'];

    it('renders an English greeting under en-US', () => {
      const { container } = render(
        withProvider('en-US', <GreetingModule config={greetingConfig} style={DEFAULT_MODULE_STYLE} />),
      );
      const text = container.textContent ?? '';
      expect(enGreetings.some((g) => text.includes(g))).toBe(true);
      expect(text).not.toMatch(RAW_KEY_PATTERN);
    });

    it('renders a German greeting under de-DE', () => {
      const { container } = render(
        withProvider('de-DE', <GreetingModule config={greetingConfig} style={DEFAULT_MODULE_STYLE} />),
      );
      const text = container.textContent ?? '';
      expect(deGreetings.some((g) => text.includes(g))).toBe(true);
      expect(text).not.toMatch(RAW_KEY_PATTERN);
    });
  });

  describe('TrafficModule empty state', () => {
    it('renders English copy under en-US', () => {
      const { container } = render(
        withProvider('en-US', <TrafficModule config={noRoutesTrafficConfig} style={DEFAULT_MODULE_STYLE} />),
      );
      expect(container.textContent).toContain('Add a route in the editor and drive times show here');
      expect(container.textContent ?? '').not.toMatch(RAW_KEY_PATTERN);
    });

    it('renders German copy under de-DE', () => {
      const { container } = render(
        withProvider('de-DE', <TrafficModule config={noRoutesTrafficConfig} style={DEFAULT_MODULE_STYLE} />),
      );
      expect(container.textContent).toContain('Füge im Editor eine Route hinzu, dann erscheinen die Fahrzeiten hier');
      expect(container.textContent ?? '').not.toMatch(RAW_KEY_PATTERN);
    });
  });

  describe('GarbageDayModule', () => {
    it('renders the section header in English under en-US', () => {
      const { container } = render(
        withProvider('en-US', <GarbageDayModule config={garbageConfig} style={DEFAULT_MODULE_STYLE} />),
      );
      expect(container.textContent).toContain('Collection Schedule');
      expect(container.textContent ?? '').not.toMatch(RAW_KEY_PATTERN);
    });

    it('renders the section header in German under de-DE', () => {
      const { container } = render(
        withProvider('de-DE', <GarbageDayModule config={garbageConfig} style={DEFAULT_MODULE_STYLE} />),
      );
      expect(container.textContent).toContain('Abfuhrkalender');
      expect(container.textContent ?? '').not.toMatch(RAW_KEY_PATTERN);
    });
  });
});
