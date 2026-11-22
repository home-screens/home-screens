// @vitest-environment jsdom

/**
 * What the slideshow panel's Google Photos import says when it finishes: one
 * count-aware sentence for what was saved and one for what was already in
 * the library, so a single photo never reads "Saved 1 new photos".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import { displayCache } from '@/lib/display-cache';
import enUSEditor from '@/translations/en-US/editor.json';

const editorFetch = vi.fn();
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => editorFetch(...args),
  isSessionExpired: () => false,
}));

import { GooglePhotosImportSection } from '../GooglePhotosImportSection';

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{children}</I18nProvider>;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Finished { total: number; done: number; skipped: number; failed: number }

/** The hub for one picking session whose picks are in at once, and whose import ends as `job`. */
const OWN_APP = {
  calendar: { mode: 'own', hostedAvailable: false },
  photos: { mode: 'own', hostedAvailable: false },
};

function hubAnswers(job: Finished) {
  editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/google/apps') return jsonResponse(OWN_APP);
    if (url === '/api/google-picker/status') return jsonResponse({ connected: true, credentialsConfigured: true });
    if (url === '/api/google-picker/session' && init?.method === 'POST') {
      return jsonResponse({ id: 'sess-1', pickerUri: 'https://photos.google.com/picker/sess-1', pollIntervalMs: 1000 });
    }
    if (url.startsWith('/api/google-picker/session?')) return jsonResponse({ mediaItemsSet: true });
    if (url === '/api/google-picker/import' && init?.method === 'POST') return jsonResponse({ jobId: 'job-1', total: job.total }, 202);
    if (url.startsWith('/api/google-picker/import?')) return jsonResponse({ state: 'done', ...job, videoFiles: [] });
    throw new Error(`unexpected request ${url}`);
  });
}

/** Opens the section, picks, and lets the import finish as `job`. */
async function importPicks(job: Finished) {
  hubAnswers(job);
  vi.spyOn(window, 'open').mockReturnValue(null);
  const onImported = vi.fn();
  const view = render(<GooglePhotosImportSection onImported={onImported} />, { wrapper: Wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // which app signs in
  fireEvent.click(view.getByText('Import from Google Photos'));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // status
  fireEvent.click(view.getByText('Choose photos'));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // session opens
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); }); // picks are in, import starts
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); // import finishes
  return { view, onImported };
}

beforeEach(() => {
  vi.useFakeTimers();
  editorFetch.mockReset();
  displayCache.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

describe('GooglePhotosImportSection when an import finishes', () => {
  it('says one new photo in the singular, and points the slideshow at the photos', async () => {
    const { view, onImported } = await importPicks({ total: 1, done: 1, skipped: 0, failed: 0 });
    expect(view.getByText('Saved 1 new photo to your library.')).toBeTruthy();
    expect(onImported).toHaveBeenCalledWith('google-photos');
  });

  it('says what was saved and what was already there, each in its own sentence', async () => {
    const { view } = await importPicks({ total: 3, done: 2, skipped: 1, failed: 0 });
    expect(view.getByText('Saved 2 new photos to your library. 1 was already in your library.')).toBeTruthy();
  });

  it('says only what was already there when nothing was new', async () => {
    const { view } = await importPicks({ total: 2, done: 0, skipped: 2, failed: 0 });
    expect(view.getByText('2 were already in your library.')).toBeTruthy();
    expect(view.queryByText(/Saved 0/)).toBeNull();
  });
});

/**
 * A hub that answers the sign-in routes: which app, whether Photos is signed
 * in, and whether its sign-in link comes back to the hub.
 */
function signInAnswers(apps: unknown, connected: () => boolean, returnsToHub = true) {
  editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/google/apps') return jsonResponse(apps);
    if (url === '/api/google-picker/status') return jsonResponse({ connected: connected(), credentialsConfigured: true });
    if (url.startsWith('/api/google-picker/auth?') && !init?.method) {
      return jsonResponse({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1', returnsToHub });
    }
    if (url === '/api/google-picker/auth' && init?.method === 'POST') return jsonResponse({ connected: true });
    throw new Error(`unexpected request ${url}`);
  });
}

async function renderSection() {
  const view = render(<GooglePhotosImportSection onImported={vi.fn()} />, { wrapper: Wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // which app signs in
  await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // Photos status
  return view;
}

const HOSTED = {
  calendar: { mode: 'hosted', hostedAvailable: true },
  photos: { mode: 'hosted', hostedAvailable: true },
};

describe('GooglePhotosImportSection with Home Screens\' own Google app', () => {
  it('shows none of the new sign-in screens while the switch is off', async () => {
    signInAnswers({
      calendar: { mode: null, hostedAvailable: false },
      photos: { mode: null, hostedAvailable: false },
    }, () => false);
    const view = await renderSection();
    expect(view.getByRole('button', { name: 'Import from Google Photos' })).toBeTruthy();
    expect(view.queryByTestId('google-photos-hosted')).toBeNull();
  });

  it('keeps a household on its own app on today\'s flow while the switch is off', async () => {
    signInAnswers(OWN_APP, () => false, false);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const view = await renderSection();
    fireEvent.click(view.getByText('Import from Google Photos'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(view.getByText('Sign in with Google, then paste the code you get at the end.')).toBeTruthy();
    expect(view.getByPlaceholderText('Paste the code or link here')).toBeTruthy();

    fireEvent.click(view.getByRole('button', { name: 'Sign in with Google' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(open).toHaveBeenCalled();
    // Still today's view, and nothing polls for a sign-in that ends on the copy page.
    expect(view.getByText('Sign in with Google, then paste the code you get at the end.')).toBeTruthy();
    const statusChecks = () => editorFetch.mock.calls.filter(([url]) => url === '/api/google-picker/status').length;
    const before = statusChecks();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(statusChecks()).toBe(before);
  });

  it('brings a household on its own app back to the hub too once the switch is on', async () => {
    let signedIn = false;
    signInAnswers({ ...HOSTED, photos: { mode: 'own', hostedAvailable: true } }, () => signedIn);
    vi.spyOn(window, 'open').mockReturnValue(null);
    const view = await renderSection();
    expect(view.queryByTestId('google-photos-hosted')).toBeNull();
    fireEvent.click(view.getByText('Import from Google Photos'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    fireEvent.click(view.getByRole('button', { name: 'Sign in with Google' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(view.getByText('Finish signing in on the Google tab.')).toBeTruthy();

    signedIn = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(view.getByText('Choose photos')).toBeTruthy();
  });

  it('goes straight to the paste box when the sign-in link cannot come back to this hub', async () => {
    signInAnswers(HOSTED, () => false, false);
    vi.spyOn(window, 'open').mockReturnValue(null);
    const view = await renderSection();
    fireEvent.click(view.getByRole('button', { name: 'Sign in with Google' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(view.queryByText('Finish signing in on the Google tab.')).toBeNull();
    expect(view.getByText('If the Google page showed you a code, paste it here.')).toBeTruthy();
  });

  it('keeps the old view when the hub cannot say which app signs in', async () => {
    editorFetch.mockImplementation(async () => { throw new Error('offline'); });
    const view = await renderSection();
    expect(view.getByRole('button', { name: 'Import from Google Photos' })).toBeTruthy();
    expect(view.queryByTestId('google-photos-hosted')).toBeNull();
  });

  it('offers Google\'s button, waits for the sign-in, and moves on by itself when it lands', async () => {
    let signedIn = false;
    signInAnswers(HOSTED, () => signedIn);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const view = await renderSection();
    expect(view.getByText('Pick photos in Google Photos and they\'re saved to this Home Screens.')).toBeTruthy();

    fireEvent.click(view.getByRole('button', { name: 'Sign in with Google' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    // The hub is told the address this editor is on, so the sign-in can come back to it.
    expect(editorFetch).toHaveBeenCalledWith(`/api/google-picker/auth?origin=${encodeURIComponent(window.location.origin)}`);
    expect(open).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1', '_blank', 'noopener');
    expect(view.getByText('Finish signing in on the Google tab.')).toBeTruthy();

    signedIn = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(view.getByText('Choose photos')).toBeTruthy();
  });

  it('keeps the paste box as a fallback, and Start over goes back to the button', async () => {
    signInAnswers(HOSTED, () => false);
    vi.spyOn(window, 'open').mockReturnValue(null);
    const view = await renderSection();
    fireEvent.click(view.getByRole('button', { name: 'Sign in with Google' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    fireEvent.click(view.getByText('Didn\'t come back? Paste a code'));
    expect(view.getByText('If the Google page showed you a code, paste it here.')).toBeTruthy();
    fireEvent.click(view.getByText('Start over'));
    expect(view.getByRole('button', { name: 'Sign in with Google' })).toBeTruthy();
  });

  it('finishes a sign-in from a pasted code', async () => {
    let signedIn = false;
    signInAnswers(HOSTED, () => signedIn);
    vi.spyOn(window, 'open').mockReturnValue(null);
    const view = await renderSection();
    fireEvent.click(view.getByRole('button', { name: 'Sign in with Google' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(view.getByText('Didn\'t come back? Paste a code'));
    fireEvent.change(view.getByPlaceholderText('Paste the code or link here'), { target: { value: '4/0Abc' } });
    signedIn = true;
    fireEvent.click(view.getByText('Finish sign-in'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(editorFetch).toHaveBeenCalledWith('/api/google-picker/auth', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ code: '4/0Abc' }),
    }));
    expect(view.getByText('Choose photos')).toBeTruthy();
  });
});

describe('GooglePhotosImportSection disconnecting while Google Calendar still uses the sign-in', () => {
  it('says why Home Screens stays listed in the Google account', async () => {
    let connected = true;
    editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/google/apps') return jsonResponse(HOSTED);
      if (url === '/api/google-picker/status' && init?.method === 'DELETE') {
        connected = false;
        return jsonResponse({ connected: false, stillUsedBy: 'calendar' });
      }
      if (url === '/api/google-picker/status') return jsonResponse({ connected, credentialsConfigured: true });
      if (url.startsWith('/api/google-picker/auth?')) return jsonResponse({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1', returnsToHub: true });
      throw new Error(`unexpected request ${url}`);
    });
    const view = await renderSection();
    expect(view.queryByTestId('google-still-used')).toBeNull();

    fireEvent.click(view.getByText('Disconnect Google Photos'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(view.getByTestId('google-still-used').textContent).toBe(enUSEditor.configSections.googlePhotosImport.stillUsedByCalendar);
  });
});
