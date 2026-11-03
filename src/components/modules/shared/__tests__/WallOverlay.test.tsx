// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { useInteractionHeld } from '@/lib/interaction-hold';
import { DOUBLE_TAP_MS } from '@/lib/sheet-tap-guard';
import { WallOverlay, WallSheetPanel } from '../WallOverlay';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const theme = getThemeTokens('linen');

function sheet(onClose: () => void, extra: Partial<Parameters<typeof WallOverlay>[0]> = {}) {
  return (
    <WallOverlay label="Dentist" onClose={onClose} autoCloseMs={10_000} {...extra}>
      <WallSheetPanel variant="sheet" theme={theme} data-detail-style="sheet">
        <p>Bring the forms</p>
      </WallSheetPanel>
    </WallOverlay>
  );
}

describe('WallOverlay', () => {
  it('is a labelled dialog on the body that holds the screen while mounted', () => {
    function HoldProbe() {
      return <span data-testid="hold">{useInteractionHeld() ? 'held' : 'free'}</span>;
    }
    const probe = render(<HoldProbe />);
    const { unmount } = render(sheet(() => {}));
    const dialog = screen.getByRole('dialog', { name: 'Dentist' });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.querySelector('[data-detail-style="sheet"]')).not.toBeNull();
    expect(probe.getByTestId('hold').textContent).toBe('held');
    unmount();
    expect(probe.getByTestId('hold').textContent).toBe('free');
  });

  it('a settled tap on the scrim closes; a tap on the panel does not', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(sheet(onClose));
    act(() => { vi.advanceTimersByTime(DOUBLE_TAP_MS); });
    fireEvent.click(screen.getByText('Bring the forms'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a scrim tap within a double tap of opening is the tap that opened it', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(sheet(onClose));
    act(() => { vi.advanceTimersByTime(DOUBLE_TAP_MS - 50); });
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('with closeOnScrim off the scrim ignores taps', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(sheet(onClose, { closeOnScrim: false }));
    act(() => { vi.advanceTimersByTime(DOUBLE_TAP_MS); });
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes itself in time, counted from the last touch, and not while paused', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { rerender } = render(sheet(onClose));
    act(() => { vi.advanceTimersByTime(8_000); });
    fireEvent.pointerDown(screen.getByText('Bring the forms'));
    act(() => { vi.advanceTimersByTime(8_000); });
    expect(onClose).not.toHaveBeenCalled();
    rerender(sheet(onClose, { paused: true }));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(onClose).not.toHaveBeenCalled();
    rerender(sheet(onClose, { paused: false }));
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
