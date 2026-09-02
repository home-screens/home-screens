// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen as dom, cleanup, act, fireEvent } from '@testing-library/react';
import type { Screen } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSCore from '@/translations/en-US/core.json';
import PaginationDots from '../PaginationDots';

function screens(n: number): Screen[] {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, name: `Screen ${i + 1}`, backgroundImage: '', modules: [] }));
}

type Props = Parameters<typeof PaginationDots>[0];

function renderDots(props: Partial<Props> = {}) {
  const all: Props = { screens: screens(3), activeIndex: 0, paused: false, onDotClick: () => {}, ...props };
  return render(
    <I18nProvider locale="en-US" blob={{ core: enUSCore }}>
      <PaginationDots {...all} />
    </I18nProvider>,
  );
}

describe('PaginationDots', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('draws one dot per screen up to ten', () => {
    renderDots({ screens: screens(10) });
    expect(dom.getAllByRole('button')).toHaveLength(10);
    expect(dom.queryByTestId('pagination-compact')).toBeNull();
  });

  it('collapses past ten screens to a counter whose arrows step and wrap', () => {
    const onDotClick = vi.fn();
    renderDots({ screens: screens(24), onDotClick });
    expect(dom.getByTestId('pagination-compact').textContent).toContain('1 / 24');
    expect(dom.getAllByRole('button')).toHaveLength(3);

    fireEvent.click(dom.getByRole('button', { name: 'Next screen' }));
    expect(onDotClick).toHaveBeenLastCalledWith(1);
    fireEvent.click(dom.getByRole('button', { name: 'Previous screen' }));
    expect(onDotClick).toHaveBeenLastCalledWith(23);
    // The counter is the active dot: the double-tap-to-pause target.
    fireEvent.click(dom.getByRole('button', { name: 'Pause rotation (double-tap)' }));
    expect(onDotClick).toHaveBeenLastCalledWith(0);
  });

  it('flashes the destination screen name for two seconds after a tap', () => {
    vi.useFakeTimers();
    renderDots();
    fireEvent.click(dom.getByRole('button', { name: 'Go to screen 3: Screen 3' }));
    expect(dom.getByTestId('pagination-label').textContent).toBe('Screen 3');
    act(() => { vi.advanceTimersByTime(2100); });
    expect(dom.queryByTestId('pagination-label')).toBeNull();
  });

  describe('paused pill', () => {
    it('is absent while rotating', () => {
      renderDots();
      expect(dom.queryByTestId('pause-pill')).toBeNull();
    });

    it('counts down to the auto-resume in minutes and resumes on tap', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
      const onResume = vi.fn();
      renderDots({ paused: true, onResume, pausedUntil: Date.now() + 4 * 60_000 });
      const pill = dom.getByTestId('pause-pill');
      expect(pill.textContent).toContain('Paused');
      expect(pill.textContent).toContain('Resumes in 4 min · tap to resume now');

      act(() => { vi.advanceTimersByTime(3 * 60_000 + 30_000); });
      expect(dom.getByTestId('pause-pill').textContent).toContain('Resumes in 30 sec');

      fireEvent.click(dom.getByTestId('pause-pill'));
      expect(onResume).toHaveBeenCalledTimes(1);
    });

    it('says just "tap to resume" when the pause has no timeout', () => {
      renderDots({ paused: true, onResume: () => {}, pausedUntil: null });
      const pill = dom.getByTestId('pause-pill');
      expect(pill.textContent).toContain('tap to resume');
      expect(pill.textContent).not.toContain('Resumes in');
    });

    it('is a plain badge in a preview (no resume handler)', () => {
      renderDots({ paused: true, pausedUntil: null });
      const pill = dom.getByTestId('pause-pill');
      expect(pill.textContent).toBe('Paused');
    });

    it('leaves the active dot as the double-tap target', () => {
      renderDots({ paused: true, onResume: () => {}, pausedUntil: null });
      expect(dom.getByRole('button', { name: 'Resume rotation' }).getAttribute('aria-current')).toBe('true');
    });
  });

  describe('progress line', () => {
    it('sits under the active dot, sized to the dwell, and freezes while paused', () => {
      const startedAt = Date.now();
      const { rerender } = renderDots({ progress: { startedAt, durationMs: 30_000 } });
      const line = dom.getByTestId('rotation-progress');
      expect(dom.getByRole('button', { name: 'Pause rotation (double-tap)' }).contains(line)).toBe(true);
      const fill = line.firstElementChild as HTMLElement;
      expect(fill.style.animation).toContain('30000ms');
      expect(fill.style.animationPlayState).toBe('running');

      rerender(
        <I18nProvider locale="en-US" blob={{ core: enUSCore }}>
          <PaginationDots screens={screens(3)} activeIndex={0} paused onDotClick={() => {}} onResume={() => {}} progress={{ startedAt, durationMs: 30_000 }} />
        </I18nProvider>,
      );
      expect((dom.getByTestId('rotation-progress').firstElementChild as HTMLElement).style.animationPlayState).toBe('paused');
    });

    it('is not drawn without a dwell (sticky screen, or off in settings)', () => {
      renderDots({ progress: null });
      expect(dom.queryByTestId('rotation-progress')).toBeNull();
    });

    it('is drawn under the counter in compact mode', () => {
      renderDots({ screens: screens(12), progress: { startedAt: Date.now(), durationMs: 10_000 } });
      expect(dom.getByTestId('pagination-compact').contains(dom.getByTestId('rotation-progress'))).toBe(true);
    });
  });
});
