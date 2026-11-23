// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useInteractionHeld } from '@/lib/interaction-hold';
import { DOUBLE_TAP_MS } from '@/lib/sheet-tap-guard';
import { useWallSheet, type WallSheetOptions } from '../useWallSheet';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** A sheet drawn inside a module's box: its own scrim and panel, the shared behaviour. */
function InBoxSheet(props: WallSheetOptions) {
  const { touched, settled } = useWallSheet(props);
  return (
    <div data-testid="scrim" onClick={settled(props.onClose)} onPointerDown={touched}>
      <div role="dialog" onClick={(e) => e.stopPropagation()}>Spend your tickets?</div>
    </div>
  );
}

describe('useWallSheet', () => {
  it('holds the screen while the sheet is up', () => {
    function HoldProbe() {
      return <span data-testid="hold">{useInteractionHeld() ? 'held' : 'free'}</span>;
    }
    const probe = render(<HoldProbe />);
    const { unmount } = render(<InBoxSheet onClose={() => {}} autoCloseMs={10_000} />);
    expect(probe.getByTestId('hold').textContent).toBe('held');
    unmount();
    expect(probe.getByTestId('hold').textContent).toBe('free');
  });

  it('ignores a scrim tap within a double tap of opening, and closes on one after', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<InBoxSheet onClose={onClose} autoCloseMs={10_000} />);
    act(() => { vi.advanceTimersByTime(DOUBLE_TAP_MS - 50); });
    fireEvent.click(screen.getByTestId('scrim'));
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.click(screen.getByText('Spend your tickets?'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes itself with nobody touching it, every touch starting the wait over, and not while paused', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { rerender } = render(<InBoxSheet onClose={onClose} autoCloseMs={10_000} />);
    act(() => { vi.advanceTimersByTime(8_000); });
    fireEvent.pointerDown(screen.getByText('Spend your tickets?'));
    act(() => { vi.advanceTimersByTime(8_000); });
    expect(onClose).not.toHaveBeenCalled();
    rerender(<InBoxSheet onClose={onClose} autoCloseMs={10_000} paused />);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(onClose).not.toHaveBeenCalled();
    rerender(<InBoxSheet onClose={onClose} autoCloseMs={10_000} />);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
