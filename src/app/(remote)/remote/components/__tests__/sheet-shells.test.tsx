// @vitest-environment jsdom

/**
 * The phone's sheets as modal dialogs: focus moves in, Tab stays in, Escape
 * closes the one on top. Five sheets drew their own shell without any of it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));
vi.mock('@/components/family/PhoneFamilyManager', () => ({ default: () => <button type="button">a member</button> }));
vi.mock('../CustomIconsOverlay', () => ({ default: () => null }));
vi.mock('@/hooks/useCustomIcons', () => ({ useCustomIcons: () => ({ icons: [], loaded: true }), refreshCustomIcons: vi.fn() }));

import TallSheet from '../TallSheet';
import SlideUpSheet from '../SlideUpSheet';
import SheetPanel from '@/components/ui/SheetPanel';
import ModalPortal from '@/components/ui/ModalPortal';
import { FamilySettingsView } from '../SettingsSheet';

afterEach(cleanup);

describe('TallSheet', () => {
  it('is a labelled modal dialog that takes focus and closes on Escape', () => {
    const onClose = vi.fn();
    render(<TallSheet label="Meal settings" title="Meal Settings" onClose={onClose}><button type="button">Save</button></TallSheet>);
    const dialog = screen.getByRole('dialog', { name: 'Meal settings' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves Escape to a dialog nested inside it', () => {
    const onClose = vi.fn();
    render(
      <TallSheet label="Dinner" title="Dinner" onClose={onClose}>
        <div role="dialog" aria-label="Serving time"><button type="button">6:00</button></div>
      </TallSheet>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: '6:00' }), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes from the dimmed area', () => {
    const onClose = vi.fn();
    const { container } = render(<TallSheet label="Dinner" title="Dinner" onClose={onClose}><span>body</span></TallSheet>);
    fireEvent.click(container.querySelector('[role="dialog"]')!.previousElementSibling!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SlideUpSheet', () => {
  function Harness({ covered = false }: { covered?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>open it</button>
        <SlideUpSheet open={open} onClose={() => setOpen(false)} title="Settings" closeLabel="Close settings" maxHeight="70dvh" covered={covered}>
          <button type="button">Family</button>
        </SlideUpSheet>
      </>
    );
  }

  it('stays out of reach while closed, takes focus when opened, and gives it back on Escape', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.hasAttribute('inert')).toBe(true);
    const opener = screen.getByRole('button', { name: 'open it' });
    opener.focus();
    fireEvent.click(opener);
    expect(dialog.hasAttribute('inert')).toBe(false);
    expect(dialog.getAttribute('aria-label')).toBe('Settings');
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(dialog.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it('ignores Escape while it is closed, and while a page opened from it covers it', () => {
    const onClose = vi.fn();
    const { rerender } = render(<SlideUpSheet open={false} onClose={onClose} title="Settings" closeLabel="Close" maxHeight="70dvh"><span /></SlideUpSheet>);
    fireEvent.keyDown(screen.getByRole('dialog', { hidden: true }), { key: 'Escape' });
    rerender(<SlideUpSheet open onClose={onClose} title="Settings" closeLabel="Close" maxHeight="70dvh" covered><span /></SlideUpSheet>);
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.hasAttribute('inert')).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('SheetPanel', () => {
  it('holds focus although its portal puts it on the page a beat after the sheet mounts', () => {
    const onClose = vi.fn();
    render(<ModalPortal><SheetPanel onClose={onClose} aria-label="Your icon"><button type="button">Save</button></SheetPanel></ModalPortal>);
    const dialog = screen.getByRole('dialog', { name: 'Your icon' });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape while it has no way to close', () => {
    render(<SheetPanel aria-label="Keeping your picture"><span /></SheetPanel>);
    expect(() => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })).not.toThrow();
  });
});

describe('the Family screen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/remote');
  });
  afterEach(() => vi.useRealTimers());

  it('goes back on the Back gesture instead of leaving the remote', () => {
    const onBack = vi.fn();
    render(<FamilySettingsView onBack={onBack} />);
    expect((window.history.state as { hsSheets?: string[] } | null)?.hsSheets?.length).toBeTruthy();
    act(() => { window.history.back(); });
    // FormOverlay hands back after its slide-out.
    act(() => { vi.advanceTimersByTime(300); });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/remote');
  });

  it('goes back on Escape', () => {
    const onBack = vi.fn();
    render(<FamilySettingsView onBack={onBack} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'a member' }), { key: 'Escape' });
    act(() => { vi.advanceTimersByTime(300); });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
