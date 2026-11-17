// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import type { PhotoSource } from '@/types/config';

const editorFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/editor-fetch', () => ({ editorFetch, isSessionExpired: () => false, sessionExpired: () => new Error('expired') }));

import ArtSourceFields from '../ArtSourceFields';

type Art = Extract<PhotoSource, { kind: 'art' }>;

let answer: { count: number };

beforeEach(() => {
  answer = { count: 812 };
  editorFetch.mockReset();
  editorFetch.mockImplementation(async (url: string) => {
    const body = url.includes('info=count') ? answer : [{ url: 'https://example.org/a.jpg', type: 'image' }];
    return { ok: true, status: 200, json: async () => body, headers: new Headers() };
  });
});
afterEach(cleanup);

const wrap = (ui: React.ReactElement) => <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{ui}</I18nProvider>;
const afterDebounce = () => act(async () => { await new Promise((r) => setTimeout(r, 700)); });

function renderArt(source: Partial<Art> = {}, use: 'stream' | 'background' = 'stream') {
  const onChange = vi.fn();
  const full: Art = { kind: 'art', ...source };
  const view = render(wrap(<ArtSourceFields use={use} source={full} onChange={onChange} />));
  return { onChange, view };
}

const addFilter = (name: string) => fireEvent.change(screen.getByDisplayValue('+ Add filter'), { target: { value: name } });

describe('ArtSourceFields', () => {
  it('filters nothing until a filter is added from the menu, and a cross takes it away again', () => {
    const { onChange, view } = renderArt({ artist: 'Claude Monet' });
    const menu = screen.getByDisplayValue('+ Add filter') as HTMLSelectElement;
    expect(Array.from(menu.options).map((o) => o.text)).toEqual(['+ Add filter', 'Subject', 'Period', 'Shape', "Match the screen's shape"]);
    fireEvent.click(screen.getByLabelText('Remove filter: Artist'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'art' });
    view.unmount();

    renderArt();
    expect(document.querySelectorAll('input[type=number], input[type=text]')).toHaveLength(0);
    addFilter('genre');
    expect(screen.getByText('Subject', { selector: 'span' })).toBeTruthy();
  });

  it('offers only the subjects the collection is made of', () => {
    renderArt({ genre: 'landscape' });
    const subject = screen.getByDisplayValue('Landscapes') as HTMLSelectElement;
    expect(Array.from(subject.options).map((o) => o.text)).toEqual(['Choose…', 'Landscapes', 'Seascapes', 'Cityscapes', 'Still life']);
  });

  it('saves the period as whole years and the genre as a choice', () => {
    const { onChange } = renderArt({ fromYear: 1600, genre: 'landscape' });
    fireEvent.change(screen.getByLabelText('To year'), { target: { value: '1800' } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'art', fromYear: 1600, genre: 'landscape', toYear: 1800 });
    fireEvent.change(screen.getByLabelText('From year'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'art', genre: 'landscape' });
  });

  it('says exactly how many paintings match once the choices settle, with a warning when few', async () => {
    renderArt({ genre: 'seascape', fromYear: 1600 });
    await afterDebounce();
    expect(screen.getByTestId('art-count').textContent).toBe('812 paintings match');
    expect(screen.queryByTestId('art-few')).toBeNull();
    expect(screen.getByTestId('photo-source-preview').querySelectorAll('img')).toHaveLength(1);
    const asked = editorFetch.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('info=count'));
    expect(asked.at(-1)).toContain('genre=seascape');
    expect(asked.at(-1)).toContain('from=1600');
    cleanup();

    answer = { count: 3 };
    renderArt({ artist: 'Canaletto' });
    await afterDebounce();
    expect(screen.getByTestId('art-count').textContent).toBe('3 paintings match');
    expect(screen.getByTestId('art-few')).toBeTruthy();
  });
});
