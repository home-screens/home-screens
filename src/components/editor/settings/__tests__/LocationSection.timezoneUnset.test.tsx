// @vitest-environment jsdom

/**
 * With no timezone saved, every surface runs on the hub's clock, and a stock Pi
 * is on UTC. The Location page is where the zone gets its one owner:
 *   - the empty picker row says "Not picked yet" rather than reading like a
 *     choice, and the notice names the hub's zone (what every surface
 *     actually falls back to) and how far it is from home;
 *   - an unset zone is called out in words a parent uses ("Use Denver time
 *     (matches Prior Lake)"), offering the saved town's own zone, or this
 *     browser's when the town's is not known;
 *   - recording a location while no zone is set brings the place's own zone
 *     with it (a Chicago laptop looking up Boulder saves Denver) and says so;
 *     a place with no known zone leaves it unset, with this browser's offered
 *     instead; a zone somebody already picked is never overwritten.
 *
 * Run under a process zone other than UTC (America/Chicago): jsdom's browser
 * zone is the process zone, and the hub here reports UTC.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({ editorFetch: vi.fn() }));

vi.mock('@/lib/editor-fetch', () => ({ editorFetch: mocks.editorFetch }));

import LocationSection from '../LocationSection';
import { isPlaceTimezone, timezoneLabel } from '@/lib/timezone';
import { zoneGapMinutes } from '@/lib/zone-suggestion';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';

const HUB_ZONE = 'UTC';
const BROWSER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
// The looked-up town's zone, never the one this browser is in.
const PLACE_ZONE = BROWSER_ZONE === 'America/Denver' ? 'Pacific/Auckland' : 'America/Denver';

/** A zone as the page words it: "Denver time", but "UTC" as it is. */
const words = (zone: string) => (isPlaceTimezone(zone) ? `${timezoneLabel(zone)} time` : timezoneLabel(zone));

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function renderSection(
  timezone: string,
  onChange = vi.fn(),
  place: { lat: string; lon: string; locationName?: string | null } = { lat: '', lon: '' },
) {
  render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>
      <LocationSection
        values={{ locationName: null, ...place, timezone }}
        onChange={onChange}
      />
    </I18nProvider>,
  );
  return onChange;
}

const notice = () => screen.queryByTestId('timezone-unset');
const zoneInput = () => screen.getByRole('combobox', { name: 'Time zone' }) as HTMLInputElement;

/** The town search answers Prior Lake's coordinates, plus whatever `extra` holds. */
function mockGeocode(extra: Record<string, unknown>) {
  mocks.editorFetch.mockImplementation(async (url: string) => {
    if (url === '/api/time') return json(200, { iso: new Date().toISOString(), timezone: HUB_ZONE });
    if (url.startsWith('/api/geocode?q=')) {
      return json(200, { latitude: 44.7133, longitude: -93.4227, displayName: 'Prior Lake, Minnesota, US', ...extra });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe('LocationSection with no timezone saved', () => {
  beforeEach(() => {
    mocks.editorFetch.mockReset();
    mocks.editorFetch.mockImplementation(async (url: string) => {
      if (url === '/api/time') return json(200, { iso: new Date().toISOString(), timezone: HUB_ZONE });
      if (url.startsWith('/api/geocode?q=')) {
        return json(200, { latitude: 44.7133, longitude: -93.4227, displayName: 'Prior Lake, Minnesota, US' });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  });

  afterEach(() => cleanup());

  it("leaves the picker on \"Not picked yet\" and names the hub's zone in the notice", async () => {
    renderSection('');
    expect(zoneInput().value).toBe('Not picked yet');
    // Before the hub answers there is no zone to name.
    expect(notice()!.textContent).toContain("Until you do, your screens use the hub's own clock.");
    await waitFor(() => expect(notice()!.textContent).toContain(`which is set to ${words(HUB_ZONE)}.`));
    // The claim must be true: while no zone is saved every device follows the
    // hub, so nothing may say each one uses its own clock.
    expect(document.body.textContent).not.toContain('each device uses its own clock');
    // The notice replaces the "change it only if..." help while nothing is picked.
    expect(document.body.textContent).not.toContain('Change it only if your home keeps a different time');
    expect(zoneInput().getAttribute('aria-describedby')).toBe(notice()!.querySelector('p[id]')!.id);
  });

  it('keeps the plain help line once a zone is picked', () => {
    renderSection('America/Chicago');
    expect(notice()).toBeNull();
    expect(screen.getByText('Usually the same as your town. Change it only if your home keeps a different time.')).toBeTruthy();
  });

  it("asks for a zone and, with no town saved, offers this browser's", async () => {
    const onChange = renderSection('');
    expect(notice()!.textContent).toContain('Pick your time zone');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `Use ${words(BROWSER_ZONE)} (this computer's time)` }));
    });
    expect(onChange).toHaveBeenCalledWith({ timezone: BROWSER_ZONE });
  });

  it("fills the town's own zone when a location is looked up, not this browser's", async () => {
    mockGeocode({ timezone: PLACE_ZONE });
    const onChange = renderSection('');
    fireEvent.change(screen.getByLabelText('Your town or zip code'), { target: { value: 'Boulder, CO' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lat: '44.7133' })));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lat: '44.7133', timezone: PLACE_ZONE }));
    for (const [update] of onChange.mock.calls) expect(update.timezone).not.toBe(BROWSER_ZONE);
    // And it says what it set, in words.
    expect(screen.getByText(/^Found Prior Lake, Minnesota, US\./).textContent)
      .toBe(`Found Prior Lake, Minnesota, US. Time zone set to ${words(PLACE_ZONE)} to match.`);
  });

  it("fills the internet location's own zone", async () => {
    mocks.editorFetch.mockImplementation(async (url: string) => {
      if (url === '/api/time') return json(200, { iso: new Date().toISOString(), timezone: HUB_ZONE });
      if (url === '/api/geocode?detect=ip') {
        return json(200, { latitude: 40.015, longitude: -105.2705, displayName: 'Boulder, Colorado, US', timezone: PLACE_ZONE });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const onChange = renderSection('');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use my internet location' }));
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lat: '40.0150', timezone: PLACE_ZONE })));
  });

  it("offers the saved town's zone, and nothing until it is known", async () => {
    let answer: (value: unknown) => void = () => {};
    mocks.editorFetch.mockImplementation(async (url: string) => {
      if (url === '/api/time') return json(200, { iso: new Date().toISOString(), timezone: HUB_ZONE });
      if (url === '/api/geocode?lat=40.0150&lon=-105.2705') return new Promise((resolve) => { answer = resolve; });
      throw new Error(`unexpected fetch: ${url}`);
    });
    const onChange = renderSection('', vi.fn(), { lat: '40.0150', lon: '-105.2705' });
    expect(notice()).not.toBeNull();
    expect(notice()!.querySelector('button')).toBeNull();
    await waitFor(() => expect(mocks.editorFetch).toHaveBeenCalledWith('/api/geocode?lat=40.0150&lon=-105.2705'));
    await act(async () => { answer(json(200, { timezone: PLACE_ZONE })); });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: `Use ${words(PLACE_ZONE)} (matches your town)` }));
    });
    expect(onChange).toHaveBeenCalledWith({ timezone: PLACE_ZONE });
  });

  it("names the saved town, and how far the hub's clock is from it", async () => {
    mocks.editorFetch.mockImplementation(async (url: string) => {
      if (url === '/api/time') return json(200, { iso: new Date().toISOString(), timezone: HUB_ZONE });
      if (url.startsWith('/api/geocode?lat=')) return json(200, { timezone: PLACE_ZONE });
      throw new Error(`unexpected fetch: ${url}`);
    });
    renderSection('', vi.fn(), { lat: '40.0150', lon: '-105.2705', locationName: 'Boulder, Colorado, US' });
    await screen.findByRole('button', { name: `Use ${words(PLACE_ZONE)} (matches Boulder)` });
    const gap = zoneGapMinutes(HUB_ZONE, PLACE_ZONE) / 60;
    const hours = `${Math.abs(gap)} hour${Math.abs(gap) === 1 ? '' : 's'}`;
    await waitFor(() => expect(notice()!.textContent).toContain(
      `That is ${hours} ${gap > 0 ? 'ahead of' : 'behind'} Boulder, so clocks and "today" can be wrong.`,
    ));
  });

  it("falls back to this browser's zone when the saved town's is not known", async () => {
    mocks.editorFetch.mockImplementation(async (url: string) => {
      if (url === '/api/time') return json(200, { iso: new Date().toISOString(), timezone: HUB_ZONE });
      if (url.startsWith('/api/geocode?lat=')) return json(404, { error: 'Time zone not found' });
      throw new Error(`unexpected fetch: ${url}`);
    });
    renderSection('', vi.fn(), { lat: '40.0150', lon: '-105.2705' });
    expect(await screen.findByRole('button', { name: `Use ${words(BROWSER_ZONE)} (this computer's time)` })).not.toBeNull();
  });

  it("saves no zone when the looked-up place names none, and offers this browser's instead", async () => {
    const onChange = renderSection('');
    fireEvent.change(screen.getByLabelText('Your town or zip code'), { target: { value: '55372' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lat: '44.7133' })));
    // A laptop's zone is never saved for a town without the parent choosing it.
    for (const [update] of onChange.mock.calls) expect(update).not.toHaveProperty('timezone');
    expect(screen.getByText('Found Prior Lake, Minnesota, US.')).toBeTruthy();
    expect(screen.getByRole('button', { name: `Use ${words(BROWSER_ZONE)} (this computer's time)` })).toBeTruthy();
  });

  it('never replaces a zone that was already picked', async () => {
    const onChange = renderSection('Europe/Berlin');
    expect(notice()).toBeNull();
    fireEvent.change(screen.getByLabelText('Your town or zip code'), { target: { value: '55372' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ lat: '44.7133' })));
    for (const [update] of onChange.mock.calls) expect(update).not.toHaveProperty('timezone');
  });
});
