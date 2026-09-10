// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CalendarEvent, CalendarPerson, FullscreenCalendarConfig, ModuleStyle } from '@/types/config';
import { EMPTY_EXTRAS } from '@/lib/calendar-extras';
import { getModuleDefinition } from '@/lib/module-registry';
import { I18nWrapper } from '../../__tests__/helpers/harness';
import FullscreenCalendarModule from '../FullscreenCalendarModule';

vi.mock('@/hooks/useFullscreenDims', () => ({ useFullscreenDims: () => ({ containerRef: () => {}, dims: { w: 1080, h: 1920 } }) }));
vi.mock('@/hooks/useTZClock', () => ({ useTZClock: () => new Date(2026, 7, 24, 15, 40) }));
vi.mock('../useCalendarExtras', () => ({ useCalendarExtras: () => EMPTY_EXTRAS }));

afterEach(cleanup);
const config = getModuleDefinition('fullscreen-calendar')!.defaultConfig as unknown as FullscreenCalendarConfig;
const event: CalendarEvent = { id: 'class', title: 'Piano lesson', start: '2026-08-24T16:00:00', end: '2026-08-24T17:00:00', allDay: false, sourceId: 'school', sourceName: 'School calendar' };
const people: CalendarPerson[] = [{ id: 'alex', name: 'Alex', color: '#60a5fa', sourceIds: ['school'] }];
function Calendar({ view, state, ready = false }: { view: FullscreenCalendarConfig['view']; state?: 'loading' | 'failed'; ready?: boolean }) {
  return <FullscreenCalendarModule config={{ ...config, view }} style={{} as ModuleStyle} events={[event]} people={ready ? people : undefined} peopleState={state} />;
}

describe('per-person calendar readiness', () => {
  it.each(['family-grid', 'free-time'] as const)('holds %s until roster ownership is ready, so source rows never flash', (view) => {
    const { container, rerender } = render(<Calendar view={view} state="loading" />, { wrapper: I18nWrapper });
    expect(container.querySelector('.fsc-skeleton')).not.toBeNull();
    expect(screen.queryByText('School calendar')).toBeNull();
    expect(container.querySelector('[data-event-id="class"]')).toBeNull();
    rerender(<Calendar view={view} ready />);
    expect(container.querySelector('.fsc-skeleton')).toBeNull();
    expect(screen.getAllByText('Alex').length).toBeGreaterThan(0);
    expect(screen.queryByText('School calendar')).toBeNull();
    expect(container.querySelector('[data-event-id="class"]')).not.toBeNull();
  });

  it('shows an unavailable state after a cold roster failure instead of suggesting free time', () => {
    const { container } = render(<Calendar view="free-time" state="failed" />, { wrapper: I18nWrapper });
    expect(screen.getByText("Can't load events right now")).toBeTruthy();
    expect(container.querySelector('[data-free-gap]')).toBeNull();
    expect(container.querySelector('[data-event-id="class"]')).toBeNull();
  });

  it('renders ordinary calendar views while the family request is pending', () => {
    const { container } = render(<Calendar view="week-list" state="loading" />, { wrapper: I18nWrapper });
    expect(container.querySelector('.fsc-skeleton')).toBeNull();
    expect(container.querySelector('[data-event-id="class"]')).not.toBeNull();
  });
});
