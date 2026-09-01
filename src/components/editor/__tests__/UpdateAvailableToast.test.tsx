// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({
  shouldShow: false as boolean,
  latestVersion: null as string | null,
  latestTag: null as string | null,
  currentVersion: '1.5.0' as string,
  handleDismiss: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock('@/hooks/useUpdateNotification', () => ({
  useUpdateNotification: vi.fn(() => ({
    shouldShow: mocks.shouldShow,
    latestVersion: mocks.latestVersion,
    latestTag: mocks.latestTag,
    currentVersion: mocks.currentVersion,
    handleDismiss: mocks.handleDismiss,
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mocks.routerPush })),
}));

// Stable store state object — returning a new object per call triggers
// infinite re-renders via Zustand selector reference-equality bailout.
const storeState = {
  config: {
    settings: {
      updateNotification: { enabled: true },
      updateChannel: 'stable',
    },
  },
};

vi.mock('@/stores/editor-store', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useEditorStore: vi.fn((selector: (s: typeof storeState) => any) =>
    selector(storeState),
  ),
}));

// editor-fetch is only wired to the hook (mocked), so an empty stub is fine.
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: vi.fn(),
}));

import UpdateAvailableToast from '../UpdateAvailableToast';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';

function renderToast() {
  return render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      <UpdateAvailableToast />
    </I18nProvider>,
  );
}

describe('UpdateAvailableToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shouldShow = false;
    mocks.latestVersion = null;
    mocks.latestTag = null;
    mocks.currentVersion = '1.5.0';
    mocks.handleDismiss = vi.fn();
    mocks.routerPush = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when shouldShow is false', () => {
    mocks.shouldShow = false;
    mocks.latestVersion = null;
    renderToast();
    // "Update Now" button should not be present
    expect(screen.queryByText('Update Now')).toBeNull();
  });

  it('renders message and buttons when shouldShow is true', () => {
    mocks.shouldShow = true;
    mocks.latestVersion = '1.6.0';
    mocks.latestTag = 'v1.6.0';
    renderToast();

    // Version number appears in the translated message "Update available: v1.6.0"
    expect(screen.getByText(/1\.6\.0/)).toBeTruthy();

    // "Update Now" button
    expect(screen.getByText('Update Now')).toBeTruthy();

    // Dismiss button (aria-label="Dismiss")
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('calls handleDismiss when dismiss button is clicked', () => {
    mocks.shouldShow = true;
    mocks.latestVersion = '1.6.0';
    mocks.latestTag = 'v1.6.0';
    renderToast();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(mocks.handleDismiss).toHaveBeenCalledTimes(1);
  });

  it('navigates to system settings when Update Now is clicked', () => {
    mocks.shouldShow = true;
    mocks.latestVersion = '1.6.0';
    mocks.latestTag = 'v1.6.0';
    renderToast();

    fireEvent.click(screen.getByText('Update Now'));

    expect(mocks.routerPush).toHaveBeenCalledTimes(1);
    const url: string = mocks.routerPush.mock.calls[0][0];
    expect(url).toContain('/editor/settings');
    expect(url).toContain('page=system');
  });
});
