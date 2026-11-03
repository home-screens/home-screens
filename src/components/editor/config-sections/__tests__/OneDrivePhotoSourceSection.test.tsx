// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import editor from '@/translations/en-US/editor.json';

const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (url: string, init?: RequestInit) => state.request(url, init),
  isSessionExpired: () => false,
}));
vi.mock('@/hooks/useEditorData', () => ({
  useEditorData: () => ({ data: null, loading: false, error: null }),
}));

import { OneDrivePhotoSourceSection } from '../OneDrivePhotoSourceSection';

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider locale="en-US" blob={{ editor }}>{children}</I18nProvider>
);

let deleteAnswer: () => Response;
let set: ReturnType<typeof vi.fn<(updates: Record<string, unknown>) => void>>;

beforeEach(() => {
  deleteAnswer = () => reply(200, { ok: true });
  set = vi.fn<(updates: Record<string, unknown>) => void>();
  state.request.mockReset();
  state.request.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/onedrive/status') return Promise.resolve(reply(200, { credentialsConfigured: true, connected: true, account: 'taylor@example.com' }));
    if (url === '/api/onedrive/auth' && init?.method === 'DELETE') return Promise.resolve(deleteAnswer());
    return Promise.resolve(reply(404, {}));
  });
});

afterEach(() => {
  cleanup();
});

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => {});
}

function mount() {
  render(
    <OneDrivePhotoSourceSection config={{ onedriveFolderId: 'f1', onedriveFolderName: 'Holidays' }} set={set} />,
    { wrapper },
  );
}

describe('OneDrivePhotoSourceSection disconnect', () => {
  it('keeps the folder when the hub refuses to disconnect, and says so', async () => {
    deleteAnswer = () => reply(500, { error: 'token store not writable' });
    mount();
    await settle();
    fireEvent.click(screen.getByText('Disconnect OneDrive'));
    await settle();
    expect(set).not.toHaveBeenCalled();
    expect(screen.getByText("Couldn't disconnect OneDrive. Check your internet connection and try again.")).toBeTruthy();
    expect(screen.getByText('Holidays')).toBeTruthy();
  });

  it('forgets the folder once the hub confirms the sign-in is gone', async () => {
    mount();
    await settle();
    fireEvent.click(screen.getByText('Disconnect OneDrive'));
    await settle();
    expect(set).toHaveBeenCalledWith({ onedriveFolderId: undefined, onedriveFolderName: undefined });
    expect(screen.queryByText(/Couldn't disconnect OneDrive/)).toBeNull();
  });
});
