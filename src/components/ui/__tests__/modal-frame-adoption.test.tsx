// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render as rtlRender, cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '@/i18n/provider';
import BackupPasswordModal from '@/components/editor/settings/BackupPasswordModal';
import WifiConnectModal from '@/components/editor/settings/network/WifiConnectModal';
import { isDialogOpen } from '@/lib/editor-keyboard';

/**
 * Structural guarantees the six hand-rolled editor dialogs picked up when they
 * moved onto the shared `ModalFrame`: the dialog role the editor's keyboard
 * guard looks for, a body portal, a focus trap, and Escape / backdrop dismissal
 * that suspends while the dialog is busy.
 */
const render = (ui: ReactElement) =>
  rtlRender(
    <I18nProvider locale="en-US" blob={{}}>
      {ui}
    </I18nProvider>,
  );

afterEach(cleanup);

describe('BackupPasswordModal after ModalFrame adoption', () => {
  it('exposes a labelled dialog role and is visible to the editor keyboard guard', () => {
    expect(isDialogOpen()).toBe(false);
    render(<BackupPasswordModal mode="set" onSubmit={() => {}} onClose={() => {}} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBe('backup-password-title');
    expect(document.getElementById(labelId!)?.tagName).toBe('H2');
    expect(isDialogOpen()).toBe(true);
  });

  it('portals to document.body rather than the caller subtree', () => {
    const { container } = render(
      <BackupPasswordModal mode="set" onSubmit={() => {}} onClose={() => {}} />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.getByRole('dialog').parentElement).toBe(document.body);
  });

  it('focuses the password field and traps Tab inside the dialog', () => {
    render(<BackupPasswordModal mode="enter" onSubmit={() => {}} onClose={() => {}} />);

    const password = document.getElementById('backup-password') as HTMLInputElement;
    expect(document.activeElement).toBe(password);

    const dialog = screen.getByRole('dialog');
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'),
    );
    const last = focusable[focusable.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);

    // Tab off the last focusable wraps back to the first, instead of escaping
    // to the page behind the password prompt.
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(focusable[0]);
  });

  it('closes on Escape and on a backdrop click when idle', () => {
    const onClose = vi.fn();
    render(<BackupPasswordModal mode="set" onSubmit={() => {}} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('stays open on Escape and backdrop click while busy', () => {
    const onClose = vi.fn();
    render(<BackupPasswordModal mode="set" busy onSubmit={() => {}} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('WifiConnectModal after ModalFrame adoption', () => {
  const props = {
    network: { ssid: 'Neighbor Wi-Fi', security: 'WPA2', signal: 70 } as never,
    wifiInterfaces: [{ device: 'wlan0' } as never],
    selectedIface: 'wlan0',
    onConnected: () => {},
    onManagementWarning: () => {},
  };

  it('renders a labelled dialog whose name comes from its own heading', () => {
    render(<WifiConnectModal {...props} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('wifi-connect-title');
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.id).toBe('wifi-connect-title');
    expect(isDialogOpen()).toBe(true);
  });

  it('still closes on Escape, as it did with its own useEscapeKey', () => {
    const onClose = vi.fn();
    render(<WifiConnectModal {...props} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
