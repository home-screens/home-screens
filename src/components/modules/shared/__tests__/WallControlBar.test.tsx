// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WallControlBar, WallControlButton, WallControlHoldButton } from '../WallControlBar';

afterEach(cleanup);

describe('WallControlBar', () => {
  it('lays out its buttons at the canvas scale, with the state word over them', () => {
    render(
      <WallControlBar unit={0.5} label="Paused" ariaLabel="Timer buttons" testId="bar">
        <WallControlButton icon={<svg />} label="Resume" onPress={() => {}} primary testId="go" />
      </WallControlBar>,
    );
    expect(screen.getByRole('toolbar', { name: 'Timer buttons' }).textContent).toContain('Paused');
    const go = screen.getByTestId('go');
    expect(go.style.width).toBe('116px');
    expect(go.style.height).toBe('86px');
  });

  it('presses a button once per tap', () => {
    const onPress = vi.fn();
    render(
      <WallControlBar unit={1} ariaLabel="b">
        <WallControlButton icon={<svg />} label="Pause" onPress={onPress} />
      </WallControlBar>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('gives a held button\'s word the full width of the button, like the others', () => {
    render(
      <WallControlBar unit={1} ariaLabel="b">
        <WallControlHoldButton icon={<svg />} label="Stop" ariaLabel="Stop (hold to confirm)" hint="Keep holding to stop" onConfirm={() => {}} />
      </WallControlBar>,
    );
    const face = screen.getByText('Stop').parentElement!;
    expect(face.style.width).toBe('100%');
    expect(face.parentElement!.className).toContain('w-full');
  });
});

describe('WallControlHoldButton hint', () => {
  it('rises over the bar\'s word so a "keep holding" never covers "Paused"', () => {
    vi.useFakeTimers();
    render(
      <WallControlBar unit={1} label="Paused" ariaLabel="b">
        <WallControlHoldButton icon={<svg />} label="Stop" ariaLabel="Stop (hold to confirm)" hint="Keep holding to stop" onConfirm={() => {}} />
      </WallControlBar>,
    );
    const stop = screen.getByRole('button', { name: 'Stop (hold to confirm)' });
    fireEvent.pointerDown(stop);
    act(() => void vi.advanceTimersByTime(200));
    fireEvent.pointerUp(stop);
    expect(screen.getByRole('status').style.bottom).toBe('calc(100% + 82px)');
    vi.useRealTimers();
  });
});
