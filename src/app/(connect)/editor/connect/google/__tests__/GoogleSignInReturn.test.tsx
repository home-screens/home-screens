// @vitest-environment jsdom

/**
 * The hub page a Google Photos sign-in comes back to: it hands the code and
 * its one-time value to the hub once, takes the code out of the address bar,
 * and says plainly how it went.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';

const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace }) }));

import GoogleSignInReturn from '../GoogleSignInReturn';

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{children}</I18nProvider>;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let fetchMock: ReturnType<typeof vi.fn>;

function arriveAt(search: string) {
  window.history.replaceState(null, '', `/editor/connect/google${search}`);
}

async function outcomeOf(view: ReturnType<typeof render>) {
  const card = view.getByTestId('google-sign-in-return');
  await waitFor(() => expect(card.dataset.outcome).not.toBe('working'));
  return card.dataset.outcome;
}

beforeEach(() => {
  routerReplace.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanup();
});

describe('GoogleSignInReturn', () => {
  it('hands the code and its one-time value to the hub once, then says Google Photos is connected', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ connected: true }));
    arriveAt('?code=4%2F0AdLIrY&state=nonce.aHR0cDovLzE5Mi4xNjguMS41MDozMDAw');

    const view = render(<GoogleSignInReturn />, { wrapper: Wrapper });

    expect(await outcomeOf(view)).toBe('connected');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/google/return', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ code: '4/0AdLIrY', state: 'nonce.aHR0cDovLzE5Mi4xNjguMS41MDozMDAw' }),
    }));
    // The single-use code never lingers in the address bar or history, nor in
    // the router's own copy of the address, which it would write back.
    expect(window.location.search).toBe('');
    expect(routerReplace).toHaveBeenCalledWith('/editor/connect/google', { scroll: false });
    expect(view.getByText('Google Photos is connected')).toBeTruthy();
    expect(view.getByText('Choose photos').tagName).toBe('STRONG');
  });

  it('says the sign-in expired when the hub no longer has it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'That sign-in has expired.', expired: true }, 400));
    arriveAt('?code=4%2F0AdLIrY&state=stale');

    const view = render(<GoogleSignInReturn />, { wrapper: Wrapper });

    expect(await outcomeOf(view)).toBe('expired');
    expect(view.getByText('That sign-in has expired')).toBeTruthy();
    expect(view.getByText('Import from Google Photos').tagName).toBe('STRONG');
  });

  it("passes on the hub's own words when something else went wrong", async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      error: "Couldn't reach the Home Screens sign-in helper. Try again in a few minutes.",
    }, 400));
    arriveAt('?code=4%2F0AdLIrY&state=nonce');

    const view = render(<GoogleSignInReturn />, { wrapper: Wrapper });

    expect(await outcomeOf(view)).toBe('failed');
    expect(view.getByText("Couldn't reach the Home Screens sign-in helper. Try again in a few minutes.")).toBeTruthy();
  });

  it('says the sign-in was cancelled, and sends nothing, when the family said no on Google', async () => {
    arriveAt('?error=access_denied&state=nonce');

    const view = render(<GoogleSignInReturn />, { wrapper: Wrapper });

    expect(await outcomeOf(view)).toBe('cancelled');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(view.getByText('Sign-in was cancelled')).toBeTruthy();
  });

  it('opened again without a code, reports how things stand instead of redeeming anything', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ connected: true, credentialsConfigured: true }));
    arriveAt('');

    const connected = render(<GoogleSignInReturn />, { wrapper: Wrapper });
    expect(await outcomeOf(connected)).toBe('connected');
    expect(fetchMock).toHaveBeenCalledWith('/api/google-picker/status');
    // Nothing in the address to clear, so the router is left alone.
    expect(routerReplace).not.toHaveBeenCalled();
    cleanup();

    fetchMock.mockResolvedValue(jsonResponse({ connected: false, credentialsConfigured: true }));
    const notConnected = render(<GoogleSignInReturn />, { wrapper: Wrapper });
    expect(await outcomeOf(notConnected)).toBe('expired');
  });

  it("says so when the browser won't let the page close its own tab", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      fetchMock.mockResolvedValue(jsonResponse({ connected: true }));
      arriveAt('?code=4%2F0AdLIrY&state=nonce');
      vi.spyOn(window, 'close').mockImplementation(() => {});
      const view = render(<GoogleSignInReturn />, { wrapper: Wrapper });
      await vi.waitFor(() => expect(view.getByTestId('google-sign-in-return').dataset.outcome).toBe('connected'));

      fireEvent.click(view.getByRole('button', { name: 'Close this tab' }));
      expect(window.close).toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
      expect(view.getByText('Your browser kept this tab open. You can close it yourself.')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
