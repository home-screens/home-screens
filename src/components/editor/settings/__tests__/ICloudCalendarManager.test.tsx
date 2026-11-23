// @vitest-environment jsdom

/**
 * iCloud calendars in Settings > Calendar whose Apple account is gone: a
 * backup put back without its passwords, say. They used to have no row at
 * all, and adding the account again and ticking one saved it a second time.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({ editorFetch: vi.fn() }));

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => mocks.editorFetch(...args),
  isSessionExpired: () => false,
}));

import ICloudCalendarManager from '../ICloudCalendarManager';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';
import { icloudSourceId } from '@/lib/icloud-source-id';
import type { ICloudSource } from '@/types/config';

const APPLE_ID = 'alex@icloud.com';
const HOME = 'https://caldav.icloud.com/1234/calendars/home/';
const WORK = 'https://caldav.icloud.com/1234/calendars/work/';
const LISTING = { calendars: [{ url: HOME, name: 'Home', color: '#ff0000' }, { url: WORK, name: 'Work', color: '#00ff00' }], birthdaysAvailable: false };

const source = (accountId: string, url: string, name: string, id = icloudSourceId(APPLE_ID, 'calendar', url)): ICloudSource =>
  ({ id, accountId, kind: 'calendar', url, name, color: '#123456', enabled: true });

/** The hub's answers: the accounts on file, one listing for each, and a new account for a POST. */
function hub(accounts: { id: string; appleId: string }[] | 'down', added?: { id: string; appleId: string }) {
  mocks.editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/icloud/accounts' && init?.method === 'POST') return new Response(JSON.stringify(added));
    if (url === '/api/icloud/accounts') {
      return accounts === 'down' ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(accounts));
    }
    return new Response(JSON.stringify(LISTING));
  });
}

function renderManager(icloudSources: ICloudSource[]) {
  const onChange = vi.fn<(updates: { icloudSources: ICloudSource[] }) => void>();
  render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>
      <ICloudCalendarManager icloudSources={icloudSources} onChange={onChange} />
    </I18nProvider>,
  );
  return onChange;
}

describe('ICloudCalendarManager', () => {
  beforeEach(() => mocks.editorFetch.mockReset());
  afterEach(cleanup);

  it('lists calendars whose Apple account is gone, each with a Remove button', async () => {
    hub([{ id: 'acct-now', appleId: 'sam@icloud.com' }]);
    const gone = source('acct-gone', HOME, 'Old Home', 'random-id-1');
    const kept = { ...source('acct-now', WORK, 'Work'), id: icloudSourceId('sam@icloud.com', 'calendar', WORK) };
    const onChange = renderManager([gone, kept]);

    const group = await screen.findByTestId('icloud-orphaned-sources');
    const rows = within(group).getAllByTestId('icloud-orphaned-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Old Home');
    fireEvent.click(within(rows[0]).getByRole('button'));
    expect(onChange).toHaveBeenCalledWith({ icloudSources: [kept] });
  });

  it('shows no such group while every calendar has its account, or while the accounts could not be read', async () => {
    hub([{ id: 'acct-now', appleId: APPLE_ID }]);
    renderManager([source('acct-now', HOME, 'Home')]);
    await screen.findAllByTestId('icloud-calendar-row');
    expect(screen.queryByTestId('icloud-orphaned-sources')).toBeNull();
    cleanup();

    // A failed read says nothing about which accounts exist: no Remove buttons on live calendars.
    hub('down');
    renderManager([source('acct-now', HOME, 'Home')]);
    await waitFor(() => expect(screen.getByText(enUSEditor.settings.calendarPage.icloud.addAccount)).toBeTruthy());
    expect(screen.queryByTestId('icloud-orphaned-sources')).toBeNull();
  });

  it('takes over the saved calendar when one ticked again has the id of one left behind', async () => {
    hub([{ id: 'acct-new', appleId: APPLE_ID }]);
    const left = source('acct-old', HOME, 'Home');
    const onChange = renderManager([left]);
    const rows = await screen.findAllByTestId('icloud-calendar-row');
    fireEvent.click(within(rows[0]).getByRole('checkbox'));

    const saved = onChange.mock.calls[0][0].icloudSources;
    expect(saved.map((s) => s.id)).toEqual([left.id]);
    expect(saved[0].accountId).toBe('acct-new');
  });

  it('brings back the calendars left behind when their Apple account is added again', async () => {
    hub([], { id: 'acct-new', appleId: APPLE_ID });
    const left = [source('acct-old', HOME, 'Home'), source('acct-old', WORK, 'Work')];
    const stranger = source('acct-other', HOME, 'Someone else', 'random-id-2');
    const onChange = renderManager([...left, stranger]);

    fireEvent.click(await screen.findByText(enUSEditor.settings.calendarPage.icloud.addAccount));
    fireEvent.change(screen.getByPlaceholderText(enUSEditor.settings.calendarPage.icloud.appleIdPlaceholder), { target: { value: APPLE_ID } });
    fireEvent.change(screen.getByPlaceholderText('xxxx-xxxx-xxxx-xxxx'), { target: { value: 'abcd-efgh-ijkl-mnop' } });
    fireEvent.click(screen.getByText(enUSEditor.settings.calendarPage.icloud.connect));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0][0].icloudSources).toEqual([
      { ...left[0], accountId: 'acct-new' },
      { ...left[1], accountId: 'acct-new' },
      stranger,
    ]);
  });
});
