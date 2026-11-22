// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import { settingsPath } from '@/lib/settings-route';
import { CalendarSourceFilter } from '../CalendarSourceFilter';

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
