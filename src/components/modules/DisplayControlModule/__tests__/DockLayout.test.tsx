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

const SCREENS: RotationState['screens'] = [
  { id: 's1', name: 'Home', iconType: 'clock' },
  { id: 's2', name: 'Calendar', iconType: 'calendar' },
  { id: 's3', name: '  ', iconType: null },
];
const rotation = (over: Partial<RotationState> = {}): RotationState => ({
  screens: SCREENS,
  // 'alert' is switched on but not rotating: off its schedule, say.
  allScreens: [...SCREENS, { id: 'alert', name: 'Alert', iconType: 'text' }],
  activeScreenId: 's2',
  showScreen: vi.fn(),
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
    expect(state.showScreen).toHaveBeenCalledWith('s1');
    expect(gotoCalls()).toEqual([]);
  });

  it('sends goto-screen by name to another display', async () => {
    const state = rotation();
    render(wrap(<DisplayControlModule config={{ ...base, defaultTarget: 'hallway' }} availableDisplays={displays} />, state));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Go to Screen 3' })); });
    expect(state.showScreen).not.toHaveBeenCalled();
    expect(gotoCalls()).toEqual([{ url: '/api/display/goto-screen', body: { screen: 's3', displayId: 'hallway' } }]);
  });

  it('with All displays jumps here and sends every other display the name', async () => {
    const state = rotation();
    render(wrap(<DisplayControlModule config={{ ...base, defaultTarget: 'all' }} availableDisplays={displays} />, state));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Go to Calendar' })); });
    expect(state.showScreen).toHaveBeenCalledWith('s2');
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

  it('with its own buttons lists those screens in that order, rotating or not, and skips a gone one', () => {
    const state = rotation();
    const dockButtons = [{ screenId: 'alert' }, { screenId: 'gone' }, { screenId: 's1' }];
    render(wrap(<DisplayControlModule config={{ ...base, dockButtons }} availableDisplays={displays} />, state));
    const names = screen.getAllByRole('button', { name: /^Go to/ }).map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Go to Alert', 'Go to Home']);
    // The showing screen is not in the dock, so nothing is marked.
    expect(screen.queryByRole('button', { name: /^Go to/, current: 'true' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Alert' }));
    expect(state.showScreen).toHaveBeenCalledWith('alert');
  });

  it('draws a button with its own name, icon and colour, and sends the screen name to another display', async () => {
    const state = rotation();
    const dockButtons = [{ screenId: 's2', label: 'Kids', icon: '✅', color: '#ef4444' }, { screenId: 's1' }];
    render(wrap(<DisplayControlModule config={{ ...base, defaultTarget: 'all', dockButtons }} availableDisplays={displays} />, state));
    const kids = screen.getByRole('button', { name: 'Go to Kids' });
    expect(kids.getAttribute('aria-current')).toBe('true');
    expect(kids.textContent).toContain('✅');
    expect(kids.textContent).toContain('Kids');
    const tile = kids.querySelector('span[style*="background"]') as HTMLElement;
    expect(tile.style.background).toContain('rgb(239, 68, 68)');
    await act(async () => { fireEvent.click(kids); });
    expect(state.showScreen).toHaveBeenCalledWith('s2');
    expect(gotoCalls()).toEqual([{ url: '/api/display/goto-screen', body: { screen: 'Calendar', displayId: 'hallway' } }]);
  });

  it('with an empty button list says there are no screens', () => {
    render(wrap(<DisplayControlModule config={{ ...base, dockButtons: [] }} availableDisplays={displays} />, rotation()));
    expect(screen.getByText('No screens yet')).toBeTruthy();
  });

  it('says so when nothing rotates here', () => {
    render(wrap(<DisplayControlModule config={base} availableDisplays={displays} />, null));
    expect(screen.getByText('No screens yet')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Go to/ })).toHaveLength(0);
  });
});
