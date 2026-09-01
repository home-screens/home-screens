// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen as dom, cleanup, act, fireEvent } from '@testing-library/react';
import type { Screen } from '@/types/config';
import PaginationDots from '../PaginationDots';

function screens(n: number): Screen[] {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, name: `Screen ${i + 1}`, backgroundImage: '', modules: [] }));
}

describe('PaginationDots', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('draws one dot per screen up to ten', () => {
    render(<PaginationDots screens={screens(10)} activeIndex={0} paused={false} onDotClick={() => {}} />);
    expect(dom.getAllByRole('button')).toHaveLength(10);
    expect(dom.queryByTestId('pagination-compact')).toBeNull();
  });

  it('collapses past ten screens to a counter whose arrows step and wrap', () => {
    const onDotClick = vi.fn();
    render(<PaginationDots screens={screens(24)} activeIndex={0} paused={false} onDotClick={onDotClick} />);
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
    render(<PaginationDots screens={screens(3)} activeIndex={0} paused={false} onDotClick={() => {}} />);
    fireEvent.click(dom.getByRole('button', { name: 'Go to screen 3: Screen 3' }));
    expect(dom.getByTestId('pagination-label').textContent).toBe('Screen 3');
    act(() => { vi.advanceTimersByTime(2100); });
    expect(dom.queryByTestId('pagination-label')).toBeNull();
  });
});
