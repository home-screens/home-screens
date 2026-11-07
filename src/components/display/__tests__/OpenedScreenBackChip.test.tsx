// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { GlobalSettings } from '@/types/config';
import OpenedScreenBackChip, { LEAVING_WARNING_MS } from '../OpenedScreenBackChip';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));

const settings = { fullscreenTheme: 'linen' } as GlobalSettings;

describe('OpenedScreenBackChip leaving line', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps its timing when the chip redraws later, and starts again for a new deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));
    const goesBackAt = Date.now() + 120_000;
    const chip = (deadline: number) => (
      <OpenedScreenBackChip screen={null} returnName="Kitchen" settings={settings} onBack={() => {}} goesBackAt={deadline} />
    );
    const { rerender } = render(chip(goesBackAt));
    const animation = () => screen.getByTestId('opened-screen-leaving').style.animation;
    expect(animation()).toContain(`${LEAVING_WARNING_MS}ms linear ${120_000 - LEAVING_WARNING_MS}ms`);

    // The wall redraws on the minute tick: a delay measured again from the
    // later now would start the drain a minute early.
    vi.setSystemTime(Date.now() + 60_000);
    rerender(chip(goesBackAt));
    expect(animation()).toContain(`${120_000 - LEAVING_WARNING_MS}ms`);

    // A touch moves the deadline: the line starts again from full.
    rerender(chip(Date.now() + 120_000));
    expect(animation()).toContain(`${120_000 - LEAVING_WARNING_MS}ms`);
    // Less than the warning away, the line starts part drained.
    rerender(chip(Date.now() + 5_000));
    expect(animation()).toContain(`${5_000 - LEAVING_WARNING_MS}ms`);
  });
});
