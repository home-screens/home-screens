// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen as dom, cleanup } from '@testing-library/react';
import SleepOverlay from '../SleepOverlay';

vi.mock('../Screensaver', () => ({
  default: ({ timeFormat }: { timeFormat?: string }) => <div data-testid="screensaver" data-time-format={timeFormat} />,
}));

/**
 * The screensaver belongs to the idle and scheduled dim paths only. A
 * brightness override (remote command, Display Control slider) dims the
 * content and draws nothing over it — lowering brightness in the evening must
 * not start a clock drifting across the modules.
 */
describe('SleepOverlay', () => {
  afterEach(cleanup);

  it('keeps the overlay mounted so active and brightness changes can fade', () => {
    const { container, rerender } = render(<SleepOverlay displayState="active" dimOpacity={0} />);
    const overlay = container.firstElementChild;
    const dimmer = overlay?.firstElementChild as HTMLElement;
    expect(dimmer.style.opacity).toBe('0');
    expect(dimmer.style.transition).toBe('opacity 500ms ease-in-out');
    rerender(<SleepOverlay displayState="dimmed" dimOpacity={0.7} brightnessOverride={30} />);
    expect(container.firstElementChild).toBe(overlay);
    expect(dimmer.style.opacity).toBe('0.7');
    rerender(<SleepOverlay displayState="dimmed" dimOpacity={0.4} brightnessOverride={60} />);
    expect(container.firstElementChild).toBe(overlay);
    expect(dimmer.style.opacity).toBe('0.4');
    rerender(<SleepOverlay displayState="active" dimOpacity={0} />);
    expect(container.firstElementChild).toBe(overlay);
    expect(dimmer.style.opacity).toBe('0');
  });

  it('shows the screensaver for an idle or scheduled dim', () => {
    render(<SleepOverlay displayState="dimmed" dimOpacity={0.8} brightnessOverride={null} />);
    expect(dom.getByTestId('screensaver')).toBeTruthy();
  });

  it('hands the household 12/24 choice to the screensaver clock', () => {
    render(<SleepOverlay displayState="dimmed" dimOpacity={0.8} brightnessOverride={null} timeFormat="24h" />);
    expect(dom.getByTestId('screensaver').getAttribute('data-time-format')).toBe('24h');
  });

  it('dims without a screensaver for a brightness override', () => {
    render(<SleepOverlay displayState="dimmed" dimOpacity={0.7} brightnessOverride={30} />);
    expect(dom.queryByTestId('screensaver')).toBeNull();
  });

  it('honours screensaver mode off on the dim paths', () => {
    render(<SleepOverlay displayState="dimmed" dimOpacity={0.8} brightnessOverride={null} screensaver={{ mode: 'off' }} />);
    expect(dom.queryByTestId('screensaver')).toBeNull();
  });

  it('is black with no screensaver while asleep', () => {
    render(<SleepOverlay displayState="asleep" dimOpacity={1} brightnessOverride={null} />);
    expect(dom.queryByTestId('screensaver')).toBeNull();
  });
});
