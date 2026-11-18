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
import { useEditorStore } from '@/stores/editor-store';
import type { ScreenConfiguration } from '@/types/config';

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
    // A slideshow fits pictures into its own box, so it is not offered the screen-shape filter.
    expect(Array.from(menu.options).map((o) => o.text)).toEqual(['+ Add filter', 'Subject', 'Period', 'Shape']);
    fireEvent.click(screen.getByLabelText('Remove filter: Artist'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'art' });
    view.unmount();

    renderArt();
    expect(document.querySelectorAll('input[type=number], input[type=text]')).toHaveLength(0);
    addFilter('genre');
    expect(screen.getByText('Subject', { selector: 'span' })).toBeTruthy();
  });

  it('offers a rotating background the screen-shape filter and the fit', () => {
    renderArt({}, 'background');
    const menu = screen.getByDisplayValue('+ Add filter') as HTMLSelectElement;
    expect(Array.from(menu.options).map((o) => o.text)).toEqual(['+ Add filter', 'Subject', 'Period', 'Artist', 'Shape', "Match the screen's shape"]);
    expect(screen.getByDisplayValue('Framed on a wall')).toBeTruthy();
  });

  it('offers a framed painting its wall, mat and frame, a matted one its mat, and saves only what is not the usual', () => {
    const { onChange, view } = renderArt({}, 'background');
    const swatches = (id: string) => Array.from(screen.getByTestId(id).querySelectorAll('button')).map((b) => b.textContent);
    expect(swatches('art-wall')).toEqual(['Charcoal', 'Warm white', 'Sage', 'From the painting']);
    expect(swatches('art-mat')).toEqual(['Cream', 'White', 'Charcoal', 'None']);
    expect(swatches('art-frame')).toEqual(['Black', 'Oak', 'Gold', 'White']);
    fireEvent.click(screen.getByTestId('art-frame').querySelector('[data-value="oak"]')!);
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'art', frame: 'oak' });
    fireEvent.click(screen.getByTestId('art-wall').querySelector('[data-value="charcoal"]')!);
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'art' });
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'art', texture: false });
    view.unmount();

    const matted = renderArt({ fit: 'mat', mat: 'painting' }, 'background');
    expect(screen.queryByTestId('art-wall')).toBeNull();
    expect(screen.queryByTestId('art-frame')).toBeNull();
    expect(swatches('art-mat')).toEqual(['Cream', 'White', 'Charcoal', 'From the painting']);
    // A frame has no "from the painting" mat, so going back to a frame lets that choice go.
    fireEvent.change(screen.getByDisplayValue('In a mat'), { target: { value: 'framed' } });
    expect(matted.onChange).toHaveBeenLastCalledWith({ kind: 'art', fit: 'framed' });
  });

  it('offers the museum label for every fit and slow drift only when the painting fills the screen', () => {
    const { onChange } = renderArt({ fit: 'cover' }, 'background');
    expect(Array.from((screen.getByDisplayValue('For the first 15 seconds') as HTMLSelectElement).options).map((o) => o.text)).toEqual(['For the first 15 seconds', 'Always', 'Off']);
    expect(screen.queryByTestId('art-mat')).toBeNull();
    expect(screen.queryByText('Canvas texture')).toBeNull();
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'art', fit: 'cover', drift: true });
    fireEvent.change(screen.getByDisplayValue('For the first 15 seconds'), { target: { value: 'off' } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'art', fit: 'cover', label: 'off' });
  });

  it('says a frame with no mat has nowhere to print the label on a wide screen, and nothing of the kind on a tall one', () => {
    const before = useEditorStore.getState().config;
    const turned = (displayTransform: 'normal' | '90') => act(() => {
      useEditorStore.setState({ config: { settings: { displayWidth: 1920, displayHeight: 1080, displayTransform }, screens: [] } as unknown as ScreenConfiguration });
    });
    try {
      turned('normal');
      const bare = renderArt({ mat: 'none' }, 'background');
      expect(screen.getByTestId('art-label-hint').textContent).toContain('nowhere to print the label');
      bare.view.unmount();
      renderArt({}, 'background');
      expect(screen.getByTestId('art-label-hint').textContent).toContain('Title, artist, year and museum');
      cleanup();
      turned('90');
      renderArt({ mat: 'none' }, 'background');
      expect(screen.getByTestId('art-label-hint').textContent).toContain('Title, artist, year and museum');
    } finally {
      act(() => { useEditorStore.setState({ config: before }); });
    }
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

  it('says plainly when nothing matches, without the "only a few" warning', async () => {
    answer = { count: 0 };
    renderArt({ artist: 'Nobody' });
    await afterDebounce();
    expect(screen.getByTestId('art-none').textContent).toBe('No paintings match. Try loosening a filter.');
    expect(screen.queryByTestId('art-count')).toBeNull();
    expect(screen.queryByTestId('art-few')).toBeNull();
  });
});
