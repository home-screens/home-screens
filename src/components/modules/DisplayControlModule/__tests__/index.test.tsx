// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import DisplayControlModule from '..';

vi.mock('@/hooks/useDisplayId', () => ({ useDisplayId: () => 'kitchen' }));

describe('DisplayControlModule integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const displays = [
    { id: 'kitchen', name: 'Kitchen' },
    { id: 'hallway', name: 'Hallway' },
  ];

  it('dispatches next-screen to the resolved self target after debounce', () => {
    render(
      <DisplayControlModule
        config={{ layout: 'panel', defaultTarget: 'self', allowRetargeting: false }}
        availableDisplays={displays}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /next screen/i }));
    act(() => vi.advanceTimersByTime(200));
    expect(fetch).toHaveBeenCalledWith('/api/display/next-screen?display=kitchen', expect.any(Object));
  });

  it('collapses rapid prev/next taps into a single trailing dispatch', () => {
    render(
      <DisplayControlModule
        config={{ layout: 'panel', defaultTarget: 'self', allowRetargeting: false }}
        availableDisplays={displays}
      />,
    );
    const btn = screen.getByRole('button', { name: /next screen/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    act(() => vi.advanceTimersByTime(200));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('dispatches to the newly-selected target after the picker changes', () => {
    render(
      <DisplayControlModule
        config={{ layout: 'panel', defaultTarget: 'all', allowRetargeting: true }}
        availableDisplays={displays}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hallway' }));
    fireEvent.click(screen.getByRole('button', { name: /next screen/i }));
    act(() => vi.advanceTimersByTime(200));
    expect(fetch).toHaveBeenCalledWith('/api/display/next-screen?display=hallway', expect.any(Object));
  });

  it('hides the picker in legacy mode (no displays registered)', () => {
    render(
      <DisplayControlModule
        config={{ layout: 'panel', defaultTarget: 'self', allowRetargeting: true }}
        availableDisplays={[]}
      />,
    );
    // In legacy mode with 'self' defaultTarget but no displays and useDisplayId mocked to 'kitchen',
    // the picker should still be hidden because isLegacyMode === true.
    // (The chip picker would render an "All" chip if shown; its absence confirms the picker is hidden.)
    expect(screen.queryByRole('button', { name: /^all$/i })).toBeNull();
  });

  it('re-resolves currentTarget when the selected display is removed mid-session', () => {
    const { rerender } = render(
      <DisplayControlModule
        config={{ layout: 'panel', defaultTarget: 'hallway', allowRetargeting: true }}
        availableDisplays={displays}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /next screen/i }));
    act(() => vi.advanceTimersByTime(200));
    expect(fetch).toHaveBeenLastCalledWith('/api/display/next-screen?display=hallway', expect.any(Object));

    // Admin removes 'hallway' — registry now only contains 'kitchen'.
    rerender(
      <DisplayControlModule
        config={{ layout: 'panel', defaultTarget: 'hallway', allowRetargeting: true }}
        availableDisplays={[{ id: 'kitchen', name: 'Kitchen' }]}
      />,
    );
    // Effect should re-resolve: defaultTarget 'hallway' no longer known → fall back to renderDisplayId 'kitchen'.
    fireEvent.click(screen.getByRole('button', { name: /next screen/i }));
    act(() => vi.advanceTimersByTime(200));
    expect(fetch).toHaveBeenLastCalledWith('/api/display/next-screen?display=kitchen', expect.any(Object));
  });

  it('renders the Bar layout when configured', () => {
    render(
      <DisplayControlModule
        config={{ layout: 'bar', defaultTarget: 'self', allowRetargeting: false }}
        availableDisplays={displays}
      />,
    );
    expect(screen.getByRole('button', { name: /previous screen/i })).toBeTruthy();
  });
});
