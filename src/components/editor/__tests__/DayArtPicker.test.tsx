// @vitest-environment jsdom

/**
 * A day rule's picture is a field: what it holds now, Choose a picture and
 * Remove. Choosing opens the Image Library on the day art that ships with
 * Home Screens, or on the household's own picture where it lives.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import DayArtPicker from '../DayArtPicker';

const editorFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/editor-fetch', () => ({ editorFetch, isSessionExpired: () => false, sessionExpired: () => new Error('expired') }));
vi.mock('@/hooks/useSecretStatus', () => ({
  useSecretStatus: () => ({ status: {}, loading: false, error: false, hasStatus: true, refetch: () => {} }),
}));

const OWN = '/api/backgrounds/serve?file=calendar-art%2Fparty.png';
const HALLOWEEN = '/starter-day-art/halloween.svg';

beforeEach(() => {
  editorFetch.mockReset();
  editorFetch.mockImplementation(async (url: string) => {
    const body = url.startsWith('/api/backgrounds/directories') ? { directories: [] }
      : url.startsWith('/api/backgrounds') ? [{ url: OWN, type: 'image' }]
        : url.startsWith('/api/auth/google/apps') ? { photos: { mode: 'own', hostedAvailable: false } }
          : {};
    return { ok: true, status: 200, json: async () => body, headers: new Headers() };
  });
});
afterEach(cleanup);

const wrap = (ui: React.ReactElement) => <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{ui}</I18nProvider>;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('DayArtPicker', () => {
  it('names the built-in art it holds, and Remove clears it', () => {
    const onChange = vi.fn();
    render(wrap(<DayArtPicker value={HALLOWEEN} onChange={onChange} />));
    expect(screen.getByTestId('day-art-name').textContent).toBe('Halloween');
    fireEvent.click(screen.getByTestId('day-art-remove'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('says there is no picture yet, with nothing to remove', () => {
    render(wrap(<DayArtPicker value={undefined} onChange={() => {}} />));
    expect(screen.getByTestId('day-art-name').textContent).toBe('No picture yet');
    expect(screen.queryByTestId('day-art-remove')).toBeNull();
  });

  it('opens on the built-in day art, and stores the one chosen', async () => {
    const onChange = vi.fn();
    render(wrap(<DayArtPicker value={undefined} onChange={onChange} />));
    fireEvent.click(screen.getByTestId('day-art-choose'));
    await settle();
    expect(screen.getByTestId('picker-tab-builtin').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByTestId('starter-picture-christmas'));
    await act(async () => { fireEvent.click(screen.getByTestId('picker-confirm')); });
    expect(onChange).toHaveBeenCalledWith('/starter-day-art/christmas.svg');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("opens on the household's own picture in its folder, with the upload hint", async () => {
    render(wrap(<DayArtPicker value={OWN} onChange={() => {}} />));
    expect(screen.getByTestId('day-art-name').textContent).toBe('party.png');
    fireEvent.click(screen.getByTestId('day-art-choose'));
    await settle();
    expect(screen.getByTestId('picker-tab-library').getAttribute('aria-selected')).toBe('true');
    expect(editorFetch.mock.calls.some(([url]) => url === '/api/backgrounds?media=both&directory=calendar-art')).toBe(true);
    expect(screen.getByTestId('picker-hint').textContent).toBe('Image or SVG, up to 10 MB');
  });
});
