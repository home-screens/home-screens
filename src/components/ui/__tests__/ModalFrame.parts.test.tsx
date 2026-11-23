// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSCore from '@/translations/en-US/core.json';
import ModalFrame, { ModalBody, ModalFooter, ModalHeader, ModalPanel } from '../ModalFrame';

const wrap = (ui: ReactElement) => render(<I18nProvider locale="en-US" blob={{ core: enUSCore }}>{ui}</I18nProvider>);

function Window({ onClose = () => {}, closable = true, onSave = () => {} }: { onClose?: () => void; closable?: boolean; onSave?: () => void }) {
  return (
    <ModalFrame labelledBy="t" onClose={onClose} closable={closable}>
      <ModalPanel>
        <ModalHeader titleId="t" title="Rename screen" onClose={onClose} closable={closable} closeBlockedHint="Saving" />
        <ModalBody>
          <input aria-label="Name" />
        </ModalBody>
        <ModalFooter onCancel={onClose} primary={{ label: 'Save', onClick: onSave }} />
      </ModalPanel>
    </ModalFrame>
  );
}

afterEach(cleanup);

describe('ModalHeader / ModalFooter', () => {
  it('names the window after its title and closes from a labelled ×', () => {
    const onClose = vi.fn();
    wrap(<Window onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Rename screen' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // While it can be closed, the header says Escape does it too.
    expect(screen.getByText('Esc')).toBeTruthy();
  });

  it('opens on the first control after the ×, not on the ×', () => {
    wrap(<Window />);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }));
  });

  it('greys the × and hides the Esc hint while the window cannot be closed', () => {
    wrap(<Window closable={false} />);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.hasAttribute('disabled')).toBe(true);
    expect(close.getAttribute('title')).toBe('Saving');
    expect(screen.queryByText('Esc')).toBeNull();
  });

  it('draws Cancel as secondary and the main action in the main colour', () => {
    const onSave = vi.fn();
    wrap(<Window onSave={onSave} />);
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('bg-hs-card');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.className).toContain('bg-hs-accent');
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('draws a deleting action in red', () => {
    wrap(
      <ModalFrame label="x" onClose={() => {}}>
        <ModalFooter onCancel={() => {}} primary={{ label: 'Delete', variant: 'danger' }} />
      </ModalFrame>,
    );
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-hs-danger');
  });
});
