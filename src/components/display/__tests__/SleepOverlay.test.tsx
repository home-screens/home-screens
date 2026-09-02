// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen as dom, cleanup } from '@testing-library/react';
import SleepOverlay from '../SleepOverlay';

vi.mock('../Screensaver', () => ({
  default: () => <div data-testid="screensaver" />,
}));

/**
 * The screensaver belongs to the idle and scheduled dim paths only. A
 * brightness override (remote command, Display Control slider) dims the
 * content and draws nothing over it — lowering brightness in the evening must
 * not start a clock drifting across the modules.
 */
describe('SleepOverlay', () => {
  afterEach(cleanup);

  it('renders nothing while active', () => {
    const { container } = render(<SleepOverlay displayState="active" dimOpacity={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the screensaver for an idle or scheduled dim', () => {
    render(<SleepOverlay displayState="dimmed" dimOpacity={0.8} brightnessOverride={null} />);
    expect(dom.getByTestId('screensaver')).toBeTruthy();
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
