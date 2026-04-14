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
});
