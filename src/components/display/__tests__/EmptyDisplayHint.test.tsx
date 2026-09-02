// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen as dom, cleanup } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSCore from '@/translations/en-US/core.json';
import EmptyDisplayHint from '../EmptyDisplayHint';

function renderHint(deliberatelyEmpty: boolean) {
  return render(
    <I18nProvider locale="en-US" blob={{ core: enUSCore }}>
      <EmptyDisplayHint deliberatelyEmpty={deliberatelyEmpty} />
    </I18nProvider>,
  );
}

describe('EmptyDisplayHint', () => {
  afterEach(cleanup);

  it('prints the hub origin as text and as a QR code, with no buttons', () => {
    const { container } = renderHint(false);
    expect(dom.getByText('Nothing on this screen yet')).toBeTruthy();
    expect(dom.getByTestId('empty-display-origin').textContent).toBe(window.location.origin);
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
