// @vitest-environment jsdom

/**
 * The phone-bookmark hint renders a real address.
 *
 * It used to read "For phone bookmarks, append ?token=TOKEN to command URLs",
 * which never said what a command URL was and gave nothing to copy. The link
 * is now built from this hub's own origin, with the key filled in once it has
 * been revealed and a stand-in before that.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({
  displayFetch: vi.fn(),
  editorFetch: vi.fn(),
  storeState: { config: { displays: undefined } } as {
    config: { displays?: { id: string; name: string; screens: [] }[] };
  },
}));

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: (...args: unknown[]) => mocks.displayFetch(...args),
}));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => mocks.editorFetch(...args),
}));
vi.mock('@/stores/editor-store', () => {
  const useEditorStore = (selector?: (state: unknown) => unknown) =>
    (selector ? selector(mocks.storeState) : mocks.storeState);
  useEditorStore.getState = () => mocks.storeState;
  return { useEditorStore };
});

import DisplayTokenPanel from '../SecuritySection/DisplayTokenPanel';
import { I18nProvider } from '@/i18n/provider';
import { __resetOriginForTests } from '@/hooks/useOrigin';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';
import type { RefusedKey } from '@/lib/display-key-refusals';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  __resetOriginForTests();
  mocks.storeState.config = { displays: undefined };
  // The editor is open on the hub's own name here, so useOrigin asks the hub
  // for its LAN address rather than printing "localhost" onto a bookmark.
  mocks.displayFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ origin: 'http://home-screens.local:3000' }),
  });
});

function renderPanel({ passwordOn = true, lastRefused = null }: { passwordOn?: boolean; lastRefused?: RefusedKey | null } = {}) {
  return render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>
      <DisplayTokenPanel token="secret-display-key" onTokenChange={() => {}} passwordOn={passwordOn} lastRefused={lastRefused} />
    </I18nProvider>,
  );
}

describe('the display key panel', () => {
  it('gives the key and the example link each their own handle', async () => {
    // Two code blocks that look alike. Addressing either by its classes is
    // what broke the security E2E spec when the second one arrived.
    const { findByTestId, getByTestId } = renderPanel();

    await findByTestId('display-key-bookmark-url');
    expect(getByTestId('display-key-value').textContent).toContain('secret-d');
    expect(getByTestId('display-key-bookmark-url').textContent).toContain('/api/display/sleep?');
  });

  it('shows a bookmarkable link with a stand-in until the key is revealed', async () => {
    const { findByText, getByText, queryByText } = renderPanel();

    const example = await findByText(/\/api\/display\/sleep\?/);
    // No displays registered: this install's display polls the legacy queue,
    // which is the one a link with no display named reaches.
    expect(example.textContent).toBe('http://home-screens.local:3000/api/display/sleep?token=YOUR-KEY');
    expect(example.textContent).not.toContain('secret-display-key');
    expect(queryByText(/points at/)).toBeNull();

    fireEvent.click(getByText('Reveal'));
    expect(example.textContent).toBe('http://home-screens.local:3000/api/display/sleep?token=secret-display-key');
  });

  it('names the display it controls once displays are registered', async () => {
    mocks.storeState.config = {
      displays: [
        { id: 'main', name: 'Kitchen', screens: [] },
        { id: 'playroom', name: 'Playroom', screens: [] },
      ],
    };
    const { findByText, getByText } = renderPanel();

    const example = await findByText(/\/api\/display\/sleep\?/);
    expect(example.textContent).toBe(
      'http://home-screens.local:3000/api/display/sleep?display=main&token=YOUR-KEY',
    );
    // With more than one display to aim at, the link says which one it hits.
    getByText("This one points at Kitchen. Swap main for another display's id to aim at that one.");
  });

  it('with no password, says the key is ready for Home Assistant before one is set', async () => {
    const { findByTestId, getByTestId } = renderPanel({ passwordOn: false });
    expect((await findByTestId('display-key-not-needed')).textContent).toBe(
      'Not needed yet. Put it in Home Assistant now and it keeps working when you set a password.',
    );
    expect(getByTestId('display-key-value').textContent).toContain('secret-d');
  });

  it('says where and when a key that does not match was tried, only while a password is on', async () => {
    const lastRefused = { at: Date.now() - 3 * 60_000, address: '192.168.1.40' };
    const { findByTestId, queryByTestId } = renderPanel({ lastRefused });
    expect((await findByTestId('display-key-refused')).textContent).toBe(
      "Something at 192.168.1.40 tried a key that doesn't match 3 minutes ago. Give it the key above.",
    );
    expect(queryByTestId('display-key-not-needed')).toBeNull();
    cleanup();

    const fresh = renderPanel({ lastRefused: { at: Date.now() - 5_000, address: null } });
    expect((await fresh.findByTestId('display-key-refused')).textContent).toBe(
      "Something tried a key that doesn't match just now. Give it the key above.",
    );
    cleanup();

    // With no password nothing is turned away, so a stale record says nothing.
    const off = renderPanel({ passwordOn: false, lastRefused });
    await off.findByTestId('display-key-not-needed');
    expect(off.queryByTestId('display-key-refused')).toBeNull();
  });

  it('says nothing about aiming when there is only one display', async () => {
    mocks.storeState.config = { displays: [{ id: 'main', name: 'Kitchen', screens: [] }] };
    const { findByText, queryByText } = renderPanel();

    const example = await findByText(/\/api\/display\/sleep\?/);
    expect(example.textContent).toContain('display=main');
    expect(queryByText(/points at/)).toBeNull();
  });
});
