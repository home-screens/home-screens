// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import DisplayControlModule from '..';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import { RotationProvider, type RotationState } from '@/components/display/rotation-context';
import enUSModules from '@/translations/en-US/modules.json';

vi.mock('@/hooks/useDisplayId', () => ({ useDisplayId: () => 'kitchen' }));

const displays = [
  { id: 'kitchen', name: 'Kitchen' },
  { id: 'hallway', name: 'Hallway' },
];

const rotation = (over: Partial<RotationState> = {}): RotationState => ({
  screens: [
    { id: 's1', name: 'Home', iconType: 'clock' },
    { id: 's2', name: 'Calendar', iconType: 'calendar' },
    { id: 's3', name: '  ', iconType: null },
  ],
  activeIndex: 1,
  goToScreen: vi.fn(),
  ...over,
});

function wrap(children: ReactNode, state: RotationState | null) {
  const inner = <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>{children}</I18nProvider>;
  return state ? <RotationProvider value={state}>{inner}</RotationProvider> : inner;
}

const base = { layout: 'dock' as const, defaultTarget: 'self', allowRetargeting: false, compact: false };

function gotoCalls(): Array<{ url: string; body: unknown }> {
  return (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    .filter((c) => String(c[0]).startsWith('/api/display/goto-screen'))
    .map((c) => ({ url: String(c[0]), body: JSON.parse(String((c[1] as RequestInit).body)) }));
}

describe('DisplayControlModule dock layout', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });
  afterEach(() => {
    cleanup();
    __resetLoaderForTests();
  });

  it('renders one button per screen, names an unnamed one, and marks the showing screen', () => {
    render(wrap(<DisplayControlModule config={base} availableDisplays={displays} />, rotation()));
    expect(screen.getByRole('button', { name: 'Go to Home' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go to Screen 3' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go to Calendar' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: 'Go to Home' }).getAttribute('aria-current')).toBeNull();
    expect(screen.queryByRole('button', { name: /next screen/i })).toBeNull();
  });

  it('jumps this display locally without a hub command', () => {
    const state = rotation();
    render(wrap(<DisplayControlModule config={base} availableDisplays={displays} />, state));
    fireEvent.click(screen.getByRole('button', { name: 'Go to Home' }));
    expect(state.goToScreen).toHaveBeenCalledWith(0);
    expect(gotoCalls()).toEqual([]);
  });

  it('sends goto-screen by name to another display', async () => {
    const state = rotation();
    render(wrap(<DisplayControlModule config={{ ...base, defaultTarget: 'hallway' }} availableDisplays={displays} />, state));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Go to Screen 3' })); });
    expect(state.goToScreen).not.toHaveBeenCalled();
    expect(gotoCalls()).toEqual([{ url: '/api/display/goto-screen', body: { screen: 's3', displayId: 'hallway' } }]);
  });

  it('with All displays jumps here and sends every other display the name', async () => {
    const state = rotation();
    render(wrap(<DisplayControlModule config={{ ...base, defaultTarget: 'all' }} availableDisplays={displays} />, state));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Go to Calendar' })); });
    expect(state.goToScreen).toHaveBeenCalledWith(1);
    expect(gotoCalls()).toEqual([{ url: '/api/display/goto-screen', body: { screen: 'Calendar', displayId: 'hallway' } }]);
  });

  it('adds Sleep and Brightness after the screens when asked', () => {
    render(wrap(<DisplayControlModule config={{ ...base, dockExtras: true }} availableDisplays={displays} />, rotation()));
    expect(screen.getByRole('button', { name: /sleep \(hold to confirm\)/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Brightness' })).toBeTruthy();
  });

  it('scrolls under a drag instead of changing the screen', () => {
    render(wrap(<DisplayControlModule config={base} availableDisplays={displays} />, rotation()));
    expect(screen.getByTestId('display-control-dock').hasAttribute('data-swipe-ignore')).toBe(true);
  });

  it('opens the brightness slider outside the scrolling pill, where nothing clips it', () => {
    render(wrap(<DisplayControlModule config={{ ...base, dockExtras: true }} availableDisplays={displays} />, rotation()));
    fireEvent.click(screen.getByRole('button', { name: 'Brightness' }));
    const popover = screen.getByTestId('display-control-dock-popover');
    expect(screen.getByTestId('display-control-dock').contains(popover)).toBe(false);
    expect(popover.querySelector('input[type="range"]')).toBeTruthy();
  });

  it('says so when nothing rotates here', () => {
    render(wrap(<DisplayControlModule config={base} availableDisplays={displays} />, null));
    expect(screen.getByText('No screens yet')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Go to/ })).toHaveLength(0);
  });
});
