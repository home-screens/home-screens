// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, renderHook, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import { settingsPath } from '@/lib/settings-route';
import { useEditorStore } from '@/stores/editor-store';
import type { ScreenConfiguration } from '@/types/config';
import { CalendarSourceFilter, useCalendarSources } from '../CalendarSourceFilter';

const Wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{children}</I18nProvider>
);

afterEach(() => cleanup());

describe('CalendarSourceFilter', () => {
  it('points to Settings, where the calendars it lists are named and coloured', () => {
    const view = render(
      <CalendarSourceFilter
        keyPrefix="configSections.calendar"
        availableSources={[{ id: 'a', name: 'Family', color: '#10b981' }, { id: 'b', name: 'Soccer', color: '#f97316' }]}
        sourceFilter={[]}
        onChange={() => {}}
      />,
      { wrapper: Wrapper },
    );
    const link = view.getByRole('link', { name: 'Change calendar names and colors in Settings' });
    expect(link.getAttribute('href')).toBe(settingsPath({ kind: 'defaults', page: 'calendar' }));
  });
});

describe('useCalendarSources', () => {
  const C4F = 'c_4f1b2e9a7d3c4b8e9f0a1b2c3d4e5f60@group.calendar.google.com';
  function withCalendars(calendar: Record<string, unknown>) {
    useEditorStore.setState({ config: { settings: { calendar: { icalSources: [], ...calendar } } } as unknown as ScreenConfiguration });
  }
  const names = (google: { id: string; summary: string; backgroundColor: string; primary: boolean }[] = []) =>
    renderHook(() => useCalendarSources('configSections.fullscreen-calendar', google), { wrapper: Wrapper })
      .result.current.availableSources.map((s) => s.name);

  it('names Google calendars without their ids while Google is signed out', () => {
    withCalendars({
      googleCalendarIds: ['primary', 'family', 'sam.rivera@gmail.com', C4F, 'en.usa#holiday@group.v.calendar.google.com'],
      calendarOverrides: { family: { name: 'Smith family' } },
    });
    // The household's own name, then the account's, then a plain numbered one: never "primary" or a code.
    expect(names()).toEqual(['Google Calendar', 'Smith family', 'sam.rivera', 'Google Calendar 2', 'Google Calendar 3']);
  });

  it('keeps Google\'s own names while it lists the calendars, under the household\'s', () => {
    withCalendars({ googleCalendarIds: ['family', C4F], calendarOverrides: { family: { name: 'Smith family' } } });
    expect(names([
      { id: 'family', summary: 'Family', backgroundColor: '#4073ff', primary: true },
      { id: C4F, summary: 'Soccer team', backgroundColor: '#16a34a', primary: false },
    ])).toEqual(['Smith family', 'Soccer team']);
  });
});
