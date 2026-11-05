// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';

vi.mock('@/stores/editor-store', () => ({
  useEditorStore: () => ({ config: null, selectedDisplayId: null }),
}));

import WallSourceGroup from '../WallSourceGroup';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) => <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{ui}</I18nProvider>;

describe('WallSourceGroup', () => {
  it('ticking the group adds it with no walls yet, and the hint says to pick some', () => {
    const onChange = vi.fn();
    render(wrap(<WallSourceGroup group="color" source={null} onChange={onChange} />));
    const checkbox = screen.getByTestId('source-row-color').querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(screen.queryByTestId('source-note-color')).toBeNull();
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ kind: 'wall', group: 'color', ids: [] });

    cleanup();
    render(wrap(<WallSourceGroup group="color" source={{ kind: 'wall', group: 'color', ids: [] }} onChange={onChange} />));
    expect(screen.getByTestId('source-note-color').textContent).toContain('Click the walls');
    expect(screen.getByTestId('starter-count-color').textContent).toBe('0/18');
  });

  it('tiles toggle their wall in and out, and the count follows', () => {
    const onChange = vi.fn();
    const { rerender } = render(wrap(<WallSourceGroup group="color" source={{ kind: 'wall', group: 'color', ids: ['ocean'] }} onChange={onChange} />));
    expect(screen.getByTestId('starter-count-color').textContent).toBe('1/18');
    expect(screen.getByTestId('starter-background-ocean').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('starter-background-dusk').getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByTestId('starter-background-dusk'));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'wall', group: 'color', ids: ['ocean', 'dusk'] });
    fireEvent.click(screen.getByTestId('starter-background-ocean'));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'wall', group: 'color', ids: [] });

    rerender(wrap(<WallSourceGroup group="pattern" source={{ kind: 'wall', group: 'pattern', ids: ['pattern-dots', 'pattern-grid'] }} onChange={onChange} />));
    expect(screen.getByTestId('starter-count-pattern').textContent).toBe('2/4');
    expect(screen.queryByTestId('source-note-pattern')).toBeNull();
  });

  it('unticking the group takes it out of the rotation', () => {
    const onChange = vi.fn();
    render(wrap(<WallSourceGroup group="pattern" source={{ kind: 'wall', group: 'pattern', ids: ['pattern-dots'] }} onChange={onChange} />));
    fireEvent.click(screen.getByTestId('source-row-pattern').querySelector('input[type=checkbox]')!);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
