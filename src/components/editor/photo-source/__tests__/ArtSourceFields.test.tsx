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

let answer: { count: number | null; approximate: boolean };

beforeEach(() => {
  answer = { count: 4900, approximate: true };
  editorFetch.mockReset();
  editorFetch.mockImplementation(async (url: string) => {
    const body = url.includes('info=count') ? answer
      : url.includes('info=museums') ? [{ id: 'Q19675', count: 4900 }]
        : [{ url: 'https://example.org/a.jpg', type: 'image' }];
    return { ok: true, status: 200, json: async () => body, headers: new Headers() };
  });
});
afterEach(cleanup);

const wrap = (ui: React.ReactElement) => <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{ui}</I18nProvider>;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const afterDebounce = () => act(async () => { await new Promise((r) => setTimeout(r, 700)); });

function renderArt(source: Partial<Art> = {}, use: 'stream' | 'background' = 'stream') {
  const onChange = vi.fn();
  const full: Art = { kind: 'art', provider: 'wikimedia', ...source };
  const view = render(wrap(<ArtSourceFields use={use} source={full} onChange={onChange} />));
  return { onChange, view };
}

const addFilter = (name: string) => fireEvent.change(screen.getByDisplayValue('+ Add filter'), { target: { value: name } });

describe('ArtSourceFields', () => {
  it('filters nothing until a filter is added from the menu, and a cross takes it away again', () => {
    const { onChange, view } = renderArt({ artist: 'Claude Monet' });
    const menu = screen.getByDisplayValue('+ Add filter') as HTMLSelectElement;
    expect(Array.from(menu.options).map((o) => o.text)).not.toContain('Artist');
    fireEvent.click(screen.getByLabelText('Remove filter: Artist'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'art', provider: 'wikimedia' });
    view.unmount();

    renderArt();
    expect(document.querySelectorAll('input')).toHaveLength(0);
    addFilter('genre');
    expect(screen.getByText('Subject', { selector: 'span' })).toBeTruthy();
  });

  it('saves the period as whole years and the genre as a choice', () => {
    const { onChange } = renderArt({ fromYear: 1600, genre: 'landscape' });
    fireEvent.change(screen.getByLabelText('To year'), { target: { value: '1800' } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'art', provider: 'wikimedia', fromYear: 1600, genre: 'landscape', toYear: 1800 });
    fireEvent.change(screen.getByLabelText('From year'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'art', provider: 'wikimedia', genre: 'landscape' });
  });

  it('lets Wikimedia museums be ticked with their counts, and leaves museums out for single-museum collections', async () => {
    const { onChange, view } = renderArt({ museums: ['Q19675'] });
    await settle();
    expect(screen.getByText('Louvre Museum (4900)')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Metropolitan Museum of Art'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'art', provider: 'wikimedia', museums: ['Q19675', 'Q160236'] });
    view.unmount();

    renderArt({ provider: 'aic' });
    expect(Array.from((screen.getByDisplayValue('+ Add filter') as HTMLSelectElement).options).map((o) => o.text)).not.toContain('Museum');
  });

  it('asks how many match once the choices settle: about for Wikimedia, exact for the museums, a warning when few', async () => {
    renderArt({ museums: ['Q19675'], fromYear: 1600 });
    await afterDebounce();
    expect(screen.getByTestId('art-count').textContent).toBe('about 4900 paintings match');
    expect(screen.getByTestId('photo-source-preview').querySelectorAll('img')).toHaveLength(1);
    const asked = editorFetch.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('info=count'));
    expect(asked.at(-1)).toContain('museums=Q19675');
    expect(asked.at(-1)).toContain('from=1600');
    cleanup();

    answer = { count: 3, approximate: false };
    renderArt({ provider: 'cleveland' });
    await afterDebounce();
    expect(screen.getByTestId('art-count').textContent).toBe('3 paintings match');
    expect(screen.getByTestId('art-few')).toBeTruthy();
  });
});
