// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import CalendarColorChoice from '../CalendarColorChoice';

const Wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{children}</I18nProvider>
);

afterEach(() => cleanup());

const radios = (view: ReturnType<typeof render>) => view.getAllByRole('radio');

describe('CalendarColorChoice', () => {
  it('offers the calendar\'s own colour first, picked while the household has none, and hands back null for it', () => {
    const onChange = vi.fn();
    const view = render(<CalendarColorChoice value={null} own="#4073ff" label="Color for Family" onChange={onChange} />, { wrapper: Wrapper });
    const own = view.getByRole('radio', { name: 'The color it comes with' });
    expect(radios(view)[0]).toBe(own);
    expect(own.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(view.getByRole('radio', { name: 'Green' }));
    expect(onChange).toHaveBeenLastCalledWith('#10b981');
    fireEvent.click(own);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('marks the household\'s colour, a palette one or any other', () => {
    const view = render(<CalendarColorChoice value="#10B981" own="#4073ff" label="x" onChange={() => {}} />, { wrapper: Wrapper });
    expect(view.getByRole('radio', { name: 'Green' }).getAttribute('aria-checked')).toBe('true');
    expect(view.getByRole('radio', { name: 'The color it comes with' }).getAttribute('aria-checked')).toBe('false');
    view.rerender(<CalendarColorChoice value="#123456" own="#4073ff" label="x" onChange={() => {}} />);
    expect(radios(view).every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    expect((view.getByLabelText('Pick another color') as HTMLInputElement).value).toBe('#123456');
  });

  it('has no own colour for a calendar link, and the colour box picks any colour', () => {
    const onChange = vi.fn();
    const view = render(<CalendarColorChoice value="#f97316" label="Color" onChange={onChange} />, { wrapper: Wrapper });
    expect(view.queryByRole('radio', { name: 'The color it comes with' })).toBeNull();
    expect(radios(view)).toHaveLength(8);
    fireEvent.change(view.getByLabelText('Pick another color'), { target: { value: '#222222' } });
    expect(onChange).toHaveBeenLastCalledWith('#222222');
  });
});
