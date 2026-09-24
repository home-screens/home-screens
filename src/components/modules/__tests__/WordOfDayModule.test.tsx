// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE, type WordOfDayConfig } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import WordOfDayModule from '../WordOfDayModule';
import { getWordEntryForDate } from '../word-of-day-data';
import { EN_US_WORDS } from '../word-of-day-words/en-US';

// jsdom doesn't ship ResizeObserver; useScaledFontSize needs it.
class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

const config: WordOfDayConfig = {} as WordOfDayConfig;

function renderWord(timezone: string) {
  return render(
    <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
      <WordOfDayModule config={config} style={{ ...DEFAULT_MODULE_STYLE }} timezone={timezone} />
    </I18nProvider>,
  );
}

/** The word for a household calendar day (local-midnight Date = calendar day). */
const wordFor = (y: number, m: number, d: number) => getWordEntryForDate(EN_US_WORDS, new Date(y, m - 1, d)).word;

describe('WordOfDayModule', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps today\'s word through the evening, when UTC is already tomorrow', () => {
    vi.useFakeTimers();
    // Tuesday Sep 22, 8 PM in Chicago.
    vi.setSystemTime(new Date('2026-09-23T01:00:00Z'));
    expect(wordFor(2026, 9, 22)).not.toBe(wordFor(2026, 9, 23));

    const { container } = renderWord('America/Chicago');
    expect(container.textContent).toContain(wordFor(2026, 9, 22));
    expect(container.textContent).not.toContain(wordFor(2026, 9, 23));
  });

  it('turns over at the household midnight without anything else re-rendering it', () => {
    vi.useFakeTimers();
    // 11:58 PM Tuesday in Chicago.
    vi.setSystemTime(new Date('2026-09-23T04:58:00Z'));

    const { container } = renderWord('America/Chicago');
    expect(container.textContent).toContain(wordFor(2026, 9, 22));

    act(() => { vi.advanceTimersByTime(3 * 60_000); });
    expect(container.textContent).toContain(wordFor(2026, 9, 23));
  });
});
