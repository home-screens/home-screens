// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen as dom, cleanup, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSCore from '@/translations/en-US/core.json';
import { __resetOriginForTests } from '@/hooks/useOrigin';
import EmptyDisplayHint from '../EmptyDisplayHint';

function renderHint(deliberatelyEmpty: boolean) {
  return render(
    <I18nProvider locale="en-US" blob={{ core: enUSCore }}>
      <EmptyDisplayHint deliberatelyEmpty={deliberatelyEmpty} />
    </I18nProvider>,
  );
}

describe('EmptyDisplayHint', () => {
  // jsdom's location is http://localhost:3000, the kiosk-on-the-hub case, so
  // the hint asks the hub for its LAN address.
  beforeEach(() => {
    __resetOriginForTests();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ origin: 'http://192.168.1.20:3000' }) }) as Response));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('prints the hub LAN address, not localhost, as text and as a QR code, with no buttons', async () => {
    const { container } = renderHint(false);
    expect(dom.getByText('Nothing on this screen yet')).toBeTruthy();
    await waitFor(() => expect(dom.getByTestId('empty-display-origin').textContent).toBe('http://192.168.1.20:3000'));
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('leaves out the hide line on a true first boot', () => {
    renderHint(false);
    expect(dom.queryByText(/Want a blank screen instead/)).toBeNull();
  });

  it('shows where the toggle lives when the display was emptied on purpose', () => {
    renderHint(true);
    expect(dom.getByText(/Want a blank screen instead/)).toBeTruthy();
  });
});
