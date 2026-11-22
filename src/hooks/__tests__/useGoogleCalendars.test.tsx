// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import core from '@/translations/en-US/core.json';

const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (url: string, init?: RequestInit) => state.request(url, init),
  isSessionExpired: () => false,
}));

import { useGoogleCalendars } from '../useGoogleCalendars';

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider locale="en-US" blob={{ core }}>{children}</I18nProvider>
);

const CALENDARS = [{ id: 'fam', summary: 'Family', backgroundColor: '#abc', primary: true }];

let statusAnswer: () => Response;
let deleteAnswer: () => Response;
let onChange: ReturnType<typeof vi.fn<(updates: { selectedCalendarIds: string[] }) => void>>;
let onAuthError: ReturnType<typeof vi.fn<(message: string) => void>>;

beforeEach(() => {
  statusAnswer = () => reply(200, { credentialsConfigured: true, mode: 'hosted', connected: true });
  deleteAnswer = () => reply(200, { ok: true });
  onChange = vi.fn<(updates: { selectedCalendarIds: string[] }) => void>();
  onAuthError = vi.fn<(message: string) => void>();
  state.request.mockReset();
  state.request.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/auth/google/status' && init?.method === 'DELETE') return Promise.resolve(deleteAnswer());
    if (url === '/api/auth/google/status') return Promise.resolve(statusAnswer());
    if (url === '/api/calendars') return Promise.resolve(reply(200, CALENDARS));
    return Promise.resolve(reply(404, {}));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mount(onSignedInElsewhere?: () => void) {
  return renderHook(
    () => useGoogleCalendars({
      values: { selectedCalendarIds: ['fam'], icalSources: [] },
      onChange,
      onAuthError,
      onSignedInElsewhere,
    }),
    { wrapper },
  );
}

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => {});
}

describe('useGoogleCalendars', () => {
  it('reads Google once, however often the page hands it new callbacks', async () => {
    // The Settings form makes new callbacks on every staged edit, so typing a
    // calendar's name used to ask Google again on each key.
    const view = renderHook(
      ({ edit }: { edit: number }) => useGoogleCalendars({
        values: { selectedCalendarIds: ['fam'], icalSources: [], daysAhead: edit } as never,
        onChange: () => onChange({ selectedCalendarIds: [] }),
        onAuthError: (m) => onAuthError(m),
      }),
      { wrapper, initialProps: { edit: 0 } },
    );
    await settle();
    for (let edit = 1; edit <= 10; edit++) view.rerender({ edit });
    await settle();
    const reads = state.request.mock.calls.map(([url]) => url);
    expect(reads.filter((url) => url === '/api/calendars')).toHaveLength(1);
    expect(reads.filter((url) => url === '/api/auth/google/status')).toHaveLength(1);
  });

  it('keeps the chosen calendars when the hub refuses to disconnect, and says so', async () => {
    deleteAnswer = () => reply(500, { error: 'token store not writable' });
    const { result } = mount();
    await settle();
    expect(result.current.googleConnected).toBe(true);
    expect(result.current.googleCalendars).toEqual(CALENDARS);

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.disconnectGoogle(); });
    expect(ok).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.googleConnected).toBe(true);
    expect(result.current.googleCalendars).toEqual(CALENDARS);
    expect(onAuthError).toHaveBeenCalledWith("Couldn't disconnect Google. Check your internet connection and try again.");
  });

  it('forgets the calendars once the hub confirms the grant is gone', async () => {
    const { result } = mount();
    await settle();

    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.disconnectGoogle(); });
    expect(ok).toBe(true);
    expect(onChange).toHaveBeenCalledWith({ selectedCalendarIds: [] });
    expect(result.current.googleConnected).toBe(false);
    expect(result.current.googleCalendars).toEqual([]);
    expect(onAuthError).not.toHaveBeenCalled();
  });

  it('says why the sign-in stays in the Google account when Google Photos import still uses it', async () => {
    deleteAnswer = () => reply(200, { connected: false, stillUsedBy: 'photos' });
    const { result } = mount();
    await settle();
    expect(result.current.stillUsedBy).toBeNull();

    await act(async () => { await result.current.disconnectGoogle(); });
    expect(result.current.googleConnected).toBe(false);
    expect(result.current.stillUsedBy).toBe('photos');

    // Signing in again clears it.
    act(() => result.current.setGoogleConnected(true));
    expect(result.current.stillUsedBy).toBeNull();
  });

  it('catches up with a sign-in finished in another tab when the editor comes back to the front', async () => {
    statusAnswer = () => reply(200, { credentialsConfigured: true, mode: 'own', connected: false });
    const signedIn = vi.fn();
    const { result } = mount(signedIn);
    await settle();
    expect(result.current.googleConnected).toBe(false);
    expect(result.current.googleCalendars).toEqual([]);

    // Google's sign-in tab closes and the editor is in front again.
    statusAnswer = () => reply(200, { credentialsConfigured: true, mode: 'own', connected: true });
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await settle();
    expect(result.current.googleConnected).toBe(true);
    expect(result.current.googleCalendars).toEqual(CALENDARS);
    expect(signedIn).toHaveBeenCalledTimes(1);

    // Already signed in: coming back to the front asks nothing more.
    const asked = state.request.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await settle();
    expect(state.request.mock.calls.length).toBe(asked);
  });

  it('does not read a failed status answer as "disconnected"', async () => {
    statusAnswer = () => reply(500, { error: 'boom' });
    const { result } = mount();
    await settle();
    expect(result.current.googleLoading).toBe(false);
    expect(result.current.googleConnected).toBe(false);
    expect(onAuthError).toHaveBeenCalledWith("Couldn't check your Google connection. Refresh the page and try again.");
    // The calendar listing was never asked for on the strength of a broken answer.
    expect(state.request.mock.calls.some(([url]) => url === '/api/calendars')).toBe(false);
  });
});
