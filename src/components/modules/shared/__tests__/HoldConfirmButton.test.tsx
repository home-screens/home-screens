// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { HoldConfirmButton } from '../HoldConfirmButton';

describe('HoldConfirmButton', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders children', () => {
    render(
      <HoldConfirmButton onConfirm={() => {}}>
        <span>Sleep</span>
      </HoldConfirmButton>,
    );
    expect(screen.getByText('Sleep')).toBeTruthy();
  });

  it('calls onConfirm after holding for the full duration', () => {
    const onConfirm = vi.fn();
    render(
      <HoldConfirmButton durationMs={1000} onConfirm={onConfirm}>
        Sleep
      </HoldConfirmButton>,
    );
    const btn = screen.getByRole('button');
    act(() => void fireEvent.pointerDown(btn));
    act(() => vi.advanceTimersByTime(1000));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not call onConfirm when released early', () => {
    const onConfirm = vi.fn();
    render(
      <HoldConfirmButton durationMs={1000} onConfirm={onConfirm}>
        Sleep
      </HoldConfirmButton>,
    );
    const btn = screen.getByRole('button');
    act(() => void fireEvent.pointerDown(btn));
    act(() => vi.advanceTimersByTime(500));
    act(() => void fireEvent.pointerUp(btn));
    act(() => vi.advanceTimersByTime(600));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('flashes the hint for about 1.5 seconds after a short tap', () => {
    render(
      <HoldConfirmButton durationMs={1000} onConfirm={() => {}} hint="Keep holding to sleep">
        Sleep
      </HoldConfirmButton>,
    );
    const btn = screen.getByRole('button');
    expect(screen.queryByRole('status')).toBeNull();
    act(() => void fireEvent.pointerDown(btn));
    act(() => vi.advanceTimersByTime(300));
    act(() => void fireEvent.pointerUp(btn));
    expect(screen.getByRole('status').textContent).toBe('Keep holding to sleep');
    act(() => vi.advanceTimersByTime(1400));
    expect(screen.getByRole('status')).toBeTruthy();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not flash the hint after a completed hold', () => {
    render(
      <HoldConfirmButton durationMs={1000} onConfirm={() => {}} hint="Keep holding to sleep">
        Sleep
      </HoldConfirmButton>,
    );
    const btn = screen.getByRole('button');
    act(() => void fireEvent.pointerDown(btn));
    act(() => vi.advanceTimersByTime(1000));
    act(() => void fireEvent.pointerUp(btn));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not flash the hint when the browser cancels the pointer', () => {
    render(
      <HoldConfirmButton durationMs={1000} onConfirm={() => {}} hint="Keep holding to sleep">
        Sleep
      </HoldConfirmButton>,
    );
    const btn = screen.getByRole('button');
    act(() => void fireEvent.pointerDown(btn));
    act(() => vi.advanceTimersByTime(300));
    act(() => void fireEvent.pointerCancel(btn));
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('HoldConfirmButton placement and holding look', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('puts the hint above a button too narrow for it, outside the clipped sweep', () => {
    render(
      <HoldConfirmButton durationMs={1000} onConfirm={() => {}} hint="Keep holding to stop" hintPlacement="above" hintFontSize={20}>
        Stop
      </HoldConfirmButton>,
    );
    const btn = screen.getByRole('button');
    act(() => void fireEvent.pointerDown(btn));
    act(() => vi.advanceTimersByTime(200));
    act(() => void fireEvent.pointerUp(btn));
    const hint = screen.getByRole('status');
    expect(hint.style.bottom).toBe('calc(100% + 12px)');
    expect(hint.style.top).toBe('');
    expect(btn.className).not.toContain('overflow-hidden');
    expect(screen.getByTestId('hold-sweep').parentElement!.className).toContain('overflow-hidden');
  });

  it('merges the holding style only while a finger is down', () => {
    render(
      <HoldConfirmButton durationMs={1000} onConfirm={() => {}} style={{ borderColor: 'white' }} holdingStyle={{ borderColor: 'red' }}>
        Stop
      </HoldConfirmButton>,
    );
    const btn = screen.getByRole('button');
    expect(btn.style.borderColor).toBe('white');
    act(() => void fireEvent.pointerDown(btn));
    expect(btn.style.borderColor).toBe('red');
    act(() => void fireEvent.pointerUp(btn));
    expect(btn.style.borderColor).toBe('white');
  });
});
