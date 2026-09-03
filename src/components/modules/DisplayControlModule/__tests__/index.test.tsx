// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import DisplayControlModule from '..';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import enUSModules from '@/translations/en-US/modules.json';

vi.mock('@/hooks/useDisplayId', () => ({ useDisplayId: () => 'kitchen' }));

function wrap(children: ReactNode) {
  return <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
}

/** Only the hub commands the module sent (the brightness report poll is filtered out). */
function commandCalls(): string[] {
  return (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    .map((c) => String(c[0]))
    .filter((url) => !url.startsWith('/api/displays') && !url.startsWith('/api/display/status'));
}

const displays = [
  { id: 'kitchen', name: 'Kitchen' },
  { id: 'hallway', name: 'Hallway' },
];

const base = { layout: 'panel' as const, defaultTarget: 'self', allowRetargeting: false, compact: false };

describe('DisplayControlModule integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    __resetLoaderForTests();
  });

  it('dispatches next-screen to the resolved self target after debounce', () => {
    render(wrap(<DisplayControlModule config={base} availableDisplays={displays} />));
    fireEvent.click(screen.getByRole('button', { name: /next screen/i }));
    act(() => vi.advanceTimersByTime(200));
    expect(commandCalls()).toContain('/api/display/next-screen?display=kitchen');
  });

  it('collapses rapid prev/next taps into a single trailing dispatch', () => {
    render(wrap(<DisplayControlModule config={base} availableDisplays={displays} />));
    const btn = screen.getByRole('button', { name: /next screen/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    act(() => vi.advanceTimersByTime(200));
    expect(commandCalls()).toHaveLength(1);
  });

  it('dispatches wake to the current target', () => {
    render(wrap(<DisplayControlModule config={base} availableDisplays={displays} />));
    fireEvent.click(screen.getByRole('button', { name: 'Wake' }));
    expect(commandCalls()).toContain('/api/display/wake?display=kitchen');
  });

  it('does not show the target row unless retargeting is on', () => {
    render(wrap(<DisplayControlModule config={base} availableDisplays={displays} />));
    expect(screen.queryByText('Controls')).toBeNull();
  });

  it('starts on this display, not All, and dispatches to the newly-selected target after the picker changes', () => {
    render(wrap(
      <DisplayControlModule config={{ ...base, allowRetargeting: true }} availableDisplays={displays} />,
    ));
    // The pill reads this display's friendly name.
    fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hallway' }));
    fireEvent.click(screen.getByRole('button', { name: /next screen/i }));
    act(() => vi.advanceTimersByTime(200));
    expect(commandCalls()).toContain('/api/display/next-screen?display=hallway');
  });

  it('hides the picker in legacy mode (no displays registered)', () => {
    render(wrap(
      <DisplayControlModule config={{ ...base, allowRetargeting: true }} availableDisplays={[]} />,
    ));
    expect(screen.queryByText('Controls')).toBeNull();
  });

  it('re-resolves currentTarget when the selected display is removed mid-session', () => {
    const { rerender } = render(wrap(
      <DisplayControlModule config={{ ...base, defaultTarget: 'hallway', allowRetargeting: true }} availableDisplays={displays} />,
    ));
    fireEvent.click(screen.getByRole('button', { name: /next screen/i }));
    act(() => vi.advanceTimersByTime(200));
    expect(commandCalls().at(-1)).toBe('/api/display/next-screen?display=hallway');

    // Admin removes 'hallway' — registry now only contains 'kitchen'.
    rerender(wrap(
      <DisplayControlModule
        config={{ ...base, defaultTarget: 'hallway', allowRetargeting: true }}
        availableDisplays={[{ id: 'kitchen', name: 'Kitchen' }]}
      />,
    ));
    // Effect should re-resolve: defaultTarget 'hallway' no longer known → fall back to renderDisplayId 'kitchen'.
    fireEvent.click(screen.getByRole('button', { name: /next screen/i }));
    act(() => vi.advanceTimersByTime(200));
    expect(commandCalls().at(-1)).toBe('/api/display/next-screen?display=kitchen');
  });

  it('cancels a pending debounced dispatch when unmounted before it fires', () => {
    const { unmount } = render(wrap(<DisplayControlModule config={base} availableDisplays={displays} />));
    fireEvent.click(screen.getByRole('button', { name: /next screen/i }));
    // Screen rotates away before the 200ms trailing edge — the dead
    // component must not dispatch a command with its captured target.
    unmount();
    act(() => vi.advanceTimersByTime(200));
    expect(commandCalls()).toHaveLength(0);
  });

  it('renders the Bar layout with words next to every icon', () => {
    render(wrap(<DisplayControlModule config={{ ...base, layout: 'bar' }} availableDisplays={displays} />));
    expect(screen.getByRole('button', { name: /previous screen/i }).textContent).toContain('Previous');
    expect(screen.getByText('Wake')).toBeTruthy();
    expect(screen.getByText('Brightness')).toBeTruthy();
  });

  it('renders only Previous and Next in the nav layout', () => {
    render(wrap(<DisplayControlModule config={{ ...base, layout: 'nav' }} availableDisplays={displays} />));
    expect(screen.getByRole('button', { name: /previous screen/i }).textContent).toContain('Previous');
    expect(screen.getByRole('button', { name: /next screen/i }).textContent).toContain('Next');
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByText('Sleep')).toBeNull();
    expect(screen.queryByText('Brightness')).toBeNull();
  });

  it('dispatches from the nav layout buttons', () => {
    render(wrap(<DisplayControlModule config={{ ...base, layout: 'nav' }} availableDisplays={displays} />));
    fireEvent.click(screen.getByRole('button', { name: /previous screen/i }));
    act(() => vi.advanceTimersByTime(200));
    expect(commandCalls().at(-1)).toBe('/api/display/prev-screen?display=kitchen');
  });

  it('compact drops the words but keeps the aria-labels', () => {
    render(wrap(<DisplayControlModule config={{ ...base, compact: true }} availableDisplays={displays} />));
    expect(screen.getByRole('button', { name: /previous screen/i }).textContent).toBe('');
    expect(screen.queryByText('Wake')).toBeNull();
  });

  it('shows a dash for brightness until the target reports, then the reported value', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/displays') {
        return Promise.resolve(new Response(JSON.stringify({
          displays: [
            { id: 'kitchen', name: 'Kitchen', status: { brightness: 40 } },
            { id: 'hallway', name: 'Hallway', status: { brightness: 90 } },
          ],
          unadopted: [],
        }), { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    }));
    render(wrap(<DisplayControlModule config={{ ...base, allowRetargeting: true }} availableDisplays={displays} />));
    expect(screen.getByTestId('display-control-brightness').textContent).toBe('–');
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('display-control-brightness').textContent).toBe('40%');

    // All displays disagree → dash again.
    fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'All displays' }));
    expect(screen.getByTestId('display-control-brightness').textContent).toBe('–');
  });

  it('holds the value just sent until the target confirms it', async () => {
    render(wrap(<DisplayControlModule config={base} availableDisplays={displays} />));
    const slider = screen.getByRole('slider');
    fireEvent.input(slider, { target: { value: '65' } });
    fireEvent.pointerUp(slider);
    expect(screen.getByTestId('display-control-brightness').textContent).toBe('65%');
    expect(fetch).toHaveBeenCalledWith('/api/display/brightness', expect.objectContaining({ method: 'POST' }));
  });
});
