// @vitest-environment jsdom

/**
 * The hub-clock offer on the settings Location page.
 *
 * A Pi flashed from a prebuilt image runs UTC. The household then picks its
 * own zone in the editor, and the screens follow that zone whatever the hub's
 * own clock says. Matching the hub's clock only tidies its log files, so the
 * offer is an optional line inside Clock check, never a box of its own that
 * reads like a new problem the moment a zone is picked.
 *
 * What this pins:
 *   - the offer lives inside Clock check, marked optional;
 *   - it appears only on a real disagreement: not while the server
 *     time is still in flight, not with no zone chosen, not for two spellings
 *     of one zone;
 *   - pressing it PUTs the *configured* zone (never the device's) and then
 *     re-reads `/api/time`, so the row goes away because the device now
 *     reports the new zone rather than because the request returned 200;
 *   - a 409 opens the password prompt instead of showing an error, matching
 *     every other privileged control in settings.
 *
 * `editorFetch` is mocked, so no request leaves the test.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({ editorFetch: vi.fn() }));

vi.mock('@/lib/editor-fetch', () => ({ editorFetch: mocks.editorFetch }));

import LocationSection from '../LocationSection';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';

/** The device's clock zone, as `/api/time` reports it. */
let deviceZone = 'UTC';
/** Answer for the next PUT /api/system/timezone. */
let putResponse: { status: number; body: unknown } = { status: 200, body: { ok: true } };
const timezonePuts: unknown[] = [];

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function section(timezone: string) {
  return (
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>
      <LocationSection
        values={{ lat: '44.7133', lon: '-93.4227', locationName: 'Prior Lake', timezone }}
        onChange={() => {}}
      />
    </I18nProvider>
  );
}

function renderSection(timezone: string) {
  return render(section(timezone));
}

const offer = () => screen.queryByTestId('device-clock-offer');

async function clickMatch() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Set the hub to / }));
  });
}

describe('LocationSection hub-clock offer', () => {
  beforeEach(() => {
    deviceZone = 'UTC';
    putResponse = { status: 200, body: { ok: true } };
    timezonePuts.length = 0;
    mocks.editorFetch.mockReset();
    mocks.editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/time') {
        return json(200, { iso: new Date().toISOString(), timezone: deviceZone, formatted: '12:00:00' });
      }
      if (url === '/api/system/timezone') {
        timezonePuts.push(JSON.parse(String(init?.body)));
        // A real success flips what the device reports, which is what the
        // component re-reads to decide the offer is done.
        if (putResponse.status === 200) deviceZone = JSON.parse(String(init?.body)).timezone;
        return json(putResponse.status, putResponse.body);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  });

  afterEach(() => cleanup());

  it("offers, inside Clock check and marked optional, to set the hub to home's zone", async () => {
    renderSection('Europe/Berlin');
    await waitFor(() => expect(offer()).not.toBeNull());
    // Folded into the diagnostic, not a box of its own next to the picker.
    expect(offer()!.closest('details')).not.toBeNull();
    expect(offer()!.closest('details')!.contains(screen.getByTestId('clock-check'))).toBe(true);
    expect(offer()!.textContent).toContain('Optional');
    // It sets the hub's clock only, and the copy must not read as if it
    // fixes the screens.
    expect(offer()!.textContent).toContain("The hub's own clock is on UTC.");
    expect(offer()!.textContent).toContain('only makes its log files easier to read');
    expect(screen.getByRole('button', { name: 'Set the hub to Berlin time' })).toBeTruthy();
  });

  it('shows the time on the screens first, then this computer and the hub', async () => {
    renderSection('Europe/Berlin');
    await waitFor(() => expect(offer()).not.toBeNull());
    const cells = [...screen.getByTestId('clock-check').children].map((c) => c.textContent ?? '');
    expect(cells[0]).toMatch(/^Your screens.*Berlin time$/);
    expect(cells[1]).toMatch(/^This computer/);
    expect(cells[2]).toMatch(/^The hub.*UTC$/);
    // Travelling is fine: the advice no longer says to change the home zone
    // whenever this computer disagrees.
    expect(screen.getByText(/Your screens always follow the time zone above/)).toBeTruthy();
  });

  it('stays quiet until the device has actually reported its zone', () => {
    renderSection('Europe/Berlin');
    // Synchronous first paint: `/api/time` has not resolved, so there is no
    // second zone to disagree with yet.
    expect(offer()).toBeNull();
  });

  it('stays quiet when no zone has been chosen', async () => {
    renderSection('');
    await waitFor(() => expect(mocks.editorFetch).toHaveBeenCalledWith('/api/time'));
    // An unset zone gets the "pick your time zone" notice instead of this offer.
    expect(offer()).toBeNull();
  });

  it('stays quiet for two spellings of the same zone', async () => {
    deviceZone = 'Asia/Calcutta';
    renderSection('Asia/Kolkata');
    await waitFor(() => expect(mocks.editorFetch).toHaveBeenCalledWith('/api/time'));
    expect(offer()).toBeNull();
  });

  it('stays quiet when the two already agree', async () => {
    deviceZone = 'Europe/Berlin';
    renderSection('Europe/Berlin');
    await waitFor(() => expect(mocks.editorFetch).toHaveBeenCalledWith('/api/time'));
    expect(offer()).toBeNull();
  });

  it('sends the configured zone, re-reads the device, and retires the offer', async () => {
    renderSection('Europe/Berlin');
    await waitFor(() => expect(offer()).not.toBeNull());

    await clickMatch();

    // The zone sent is the one the screens use, never the device's current one.
    await waitFor(() => expect(timezonePuts).toEqual([{ timezone: 'Europe/Berlin' }]));
    // Re-read: the row disappears because /api/time now says Europe/Berlin.
    await waitFor(() => expect(offer()).toBeNull());
    expect(mocks.editorFetch.mock.calls.filter(([url]) => url === '/api/time')).toHaveLength(2);
    // The confirmation outlives the row it replaced.
    expect(screen.getByText("The hub's clock now matches your screens.")).toBeTruthy();
  });

  it('offers to reconcile a zone whose modern name the Intl list omits', async () => {
    // Europe/Kyiv is a real zone, but `Intl.supportedValuesOf` here names only
    // the legacy Europe/Kiev. Screening the configured zone against that list
    // meant a household on Kyiv never saw the offer at all.
    renderSection('Europe/Kyiv');
    await waitFor(() => expect(offer()).not.toBeNull());
    expect(screen.getByRole('button', { name: 'Set the hub to Kyiv time' })).toBeTruthy();

    await clickMatch();
    // And the zone sent is the spelling the household chose, untranslated.
    await waitFor(() => expect(timezonePuts).toEqual([{ timezone: 'Europe/Kyiv' }]));
  });

  it('stays quiet when the chosen zone is the device zone under its other name', async () => {
    deviceZone = 'Europe/Kiev';
    renderSection('Europe/Kyiv');
    await waitFor(() => expect(mocks.editorFetch).toHaveBeenCalledWith('/api/time'));
    expect(offer()).toBeNull();
  });

  it('drops the confirmation once a different zone is chosen', async () => {
    const { rerender } = renderSection('Europe/Berlin');
    await waitFor(() => expect(offer()).not.toBeNull());
    await clickMatch();
    await waitFor(() => expect(offer()).toBeNull());
    expect(screen.queryByText("The hub's clock now matches your screens.")).not.toBeNull();

    // Picking a new zone brings the mismatch back, and "now matches your
    // screens" underneath it would contradict the line above.
    await act(async () => {
      rerender(section('Asia/Tokyo'));
    });
    await waitFor(() => expect(offer()).not.toBeNull());
    expect(screen.queryByText("The hub's clock now matches your screens.")).toBeNull();
  });

  it('drops a failure notice once a different zone is chosen', async () => {
    putResponse = { status: 500, body: { ok: false, error: 'Failed to set time zone: read-only' } };
    const { rerender } = renderSection('Europe/Berlin');
    await waitFor(() => expect(offer()).not.toBeNull());
    await clickMatch();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeNull());

    // A failure about Berlin says nothing about Tokyo either.
    await act(async () => {
      rerender(section('Asia/Tokyo'));
    });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(offer()).not.toBeNull();
  });

  it('shows the device password prompt on a 409 instead of an error', async () => {
    putResponse = { status: 409, body: { ok: false, error: 'nope', needsSudoPassword: true } };
    renderSection('Europe/Berlin');
    await waitFor(() => expect(offer()).not.toBeNull());

    await clickMatch();

    await waitFor(() => expect(screen.getByLabelText(/device password/i)).toBeTruthy());
    expect(screen.queryByText('nope')).toBeNull();
    // Still offered, because nothing changed and the row has to stay.
    expect(offer()).not.toBeNull();
  });

  it("surfaces the device's own words when the change fails", async () => {
    putResponse = { status: 500, body: { ok: false, error: 'Failed to set time zone: read-only' } };
    renderSection('Europe/Berlin');
    await waitFor(() => expect(offer()).not.toBeNull());

    await clickMatch();

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('read-only'));
    expect(offer()).not.toBeNull();
  });
});
