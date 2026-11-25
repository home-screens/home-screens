// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WallControlBar, WallControlButton, WallControlHoldButton, wallControlBarFit } from '../WallControlBar';

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

  it('while the bar settles, takes no tap and keeps its look, stacked and centred', () => {
    const onPress = vi.fn();
    const bar = (settling: boolean) => (
      <WallControlBar unit={1} ariaLabel="b" settling={settling}>
        <WallControlButton icon={<svg />} label="+1 min" onPress={onPress} testId="plus" />
      </WallControlBar>
    );
    const { rerender } = render(bar(true));
    const plus = screen.getByTestId('plus');
    // The centring rides on this class. Dropping it with the press handlers
    // left the icon and its word laid out as plain button content, which on
    // the wall read as the icon sliding out of the middle.
    expect(plus.className).toContain('flex-col');
    expect(plus.className).toContain('items-center');
    expect(plus.className).toContain('justify-center');
    // No pressed look on a tap that does nothing, and no dimming either.
    expect(plus.className).not.toContain('wall-btn');
    expect(plus.style.opacity).toBe('');
    fireEvent.click(plus);
    expect(onPress).not.toHaveBeenCalled();

    rerender(bar(false));
    fireEvent.click(screen.getByTestId('plus'));
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

describe('wallControlBarFit', () => {
  // A 1080 by 1920 wall: unit 1, 1080 px wide.
  it('leaves three and four buttons at full size on a portrait wall', () => {
    expect(wallControlBarFit(3, 1, 1080)).toBe(1);
    expect(wallControlBarFit(4, 1, 1080)).toBe(1);
  });

  it('shrinks five and six buttons until the whole row is on the wall', () => {
    for (const count of [5, 6]) {
      const fit = wallControlBarFit(count, 1, 1080);
      expect(fit).toBeLessThan(1);
      const row = (count * 232 + (count - 1) * 20 + 44) * fit;
      expect(row).toBeLessThanOrEqual(1080 - 2 * 20 + 0.001);
    }
  });

  it('leaves a landscape wall alone, and a bar that was not told its room', () => {
    // 1920 by 1080: the views scale by 0.5625 and the wall is 1920 wide.
    expect(wallControlBarFit(6, 0.5625, 1920)).toBe(1);
    expect(wallControlBarFit(6, 1)).toBe(1);
  });

  it('draws every button of a six button bar inside the given width', () => {
    render(
      <WallControlBar unit={1} maxWidth={1080} ariaLabel="Timer buttons" testId="fit-bar">
        {[1, 2, 3, 4, 5].map((n) => <WallControlButton key={n} icon={<svg />} label={`B${n}`} onPress={() => {}} testId={`b${n}`} />)}
        <WallControlHoldButton icon={<svg />} label="Stop" ariaLabel="Stop" hint="Keep holding" onConfirm={() => {}} testId="hold" />
      </WallControlBar>,
    );
    const width = parseFloat(screen.getByTestId('b1').style.width);
    expect(width).toBeLessThan(232);
    expect(width * 6 + parseFloat(screen.getByTestId('fit-bar').style.gap) * 5).toBeLessThanOrEqual(1080 - 40);
  });
});
