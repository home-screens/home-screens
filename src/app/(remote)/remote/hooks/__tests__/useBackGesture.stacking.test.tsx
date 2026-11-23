// @vitest-environment jsdom

/**
 * The Back gesture with overlays stacked on one another.
 *
 * Every phone sheet takes a history entry now, not only the full-screen
 * forms: Back from a half-written note or list item used to leave the remote.
 * Each entry stands on the ones under it, so Back closes the overlay on top
 * and nothing else, and overlays that close together (a confirm and the sheet
 * it deleted) give their entries back at once, so the next Back is never a
 * step that does nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));

import FormOverlay from '../../components/FormOverlay';
import BottomSheet from '../../components/BottomSheet';
import ConfirmSheet from '../../components/ConfirmSheet';
import SlideUpSheet from '../../components/SlideUpSheet';
import SheetFrame from '../../components/SheetFrame';

/** The overlays standing on the entry the page is on, bottom first. */
function stack(): string[] {
  return (window.history.state as { hsSheets?: string[] } | null)?.hsSheets ?? [];
}

/** Let every queued give-back and traversal run. */
function settle() {
  for (let i = 0; i < 4; i += 1) act(() => { vi.advanceTimersByTime(10); });
}

/** The Back gesture: pop the top entry and let jsdom deliver it. */
function pressBack() {
  act(() => { window.history.back(); });
  settle();
}

function dialog(name: string) {
  return screen.queryByRole('dialog', { name });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/remote?tab=calendar');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The event form with its Repeats sheet, drawn inside the form. */
function FormWithSheet() {
  const [formOpen, setFormOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  return formOpen ? (
    <FormOverlay title="New event" onBack={() => setFormOpen(false)}>
      <button type="button" onClick={() => setSheetOpen(true)}>Repeats</button>
      {sheetOpen && <BottomSheet title="Repeat it" onClose={() => setSheetOpen(false)}><span>Every week</span></BottomSheet>}
    </FormOverlay>
  ) : <p>the calendar</p>;
}

describe('a sheet over a form', () => {
  it('closes first on Back, then the form, and leaves nothing behind', () => {
    render(<FormWithSheet />);
    settle();
    fireEvent.click(screen.getByRole('button', { name: 'Repeats' }));
    settle();
    expect(stack()).toHaveLength(2);

    pressBack();
    expect(dialog('Repeat it')).toBeNull();
    expect(dialog('New event')).toBeTruthy();
    expect(stack()).toHaveLength(1);

    pressBack();
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('the calendar')).toBeTruthy();
    expect(stack()).toHaveLength(0);
  });

  it('asks before a dirty form goes, once the sheet over it is closed', () => {
    function DirtyForm() {
      const [sheetOpen, setSheetOpen] = useState(false);
      return (
        <FormOverlay title="New event" dirty onBack={() => {}}>
          <button type="button" onClick={() => setSheetOpen(true)}>Repeats</button>
          {sheetOpen && <BottomSheet title="Repeat it" onClose={() => setSheetOpen(false)}><span /></BottomSheet>}
        </FormOverlay>
      );
    }
    render(<DirtyForm />);
    settle();
    fireEvent.click(screen.getByRole('button', { name: 'Repeats' }));
    settle();

    pressBack();
    expect(dialog('Repeat it')).toBeNull();
    expect(screen.queryByTestId('confirm-sheet')).toBeNull();

    pressBack();
    expect(screen.getByTestId('confirm-sheet')).toBeTruthy();
  });

  it('closes the sheet on Escape and leaves the form open', () => {
    render(<FormWithSheet />);
    fireEvent.click(screen.getByRole('button', { name: 'Repeats' }));
    fireEvent.keyDown(screen.getByText('Every week'), { key: 'Escape' });
    expect(dialog('Repeat it')).toBeNull();
    expect(dialog('New event')).toBeTruthy();
  });
});

/** A list's sheet, whose Delete asks first and then closes the sheet with it. */
function SheetWithConfirm() {
  const [sheetOpen, setSheetOpen] = useState(true);
  const [asking, setAsking] = useState(false);
  return (
    <>
      {sheetOpen && (
        <BottomSheet title="Groceries" onClose={() => setSheetOpen(false)}>
          <button type="button" onClick={() => setAsking(true)}>Delete list</button>
          {asking && (
            <ConfirmSheet
              title="Delete Groceries?"
              description="Its items go too."
              confirmLabel="Delete"
              onConfirm={() => { setAsking(false); setSheetOpen(false); }}
              onCancel={() => setAsking(false)}
            />
          )}
        </BottomSheet>
      )}
      <p>the lists</p>
    </>
  );
}

describe('a confirm over a sheet', () => {
  it('closes first on Back, keeping the sheet, then the sheet', () => {
    render(<SheetWithConfirm />);
    settle();
    fireEvent.click(screen.getByRole('button', { name: 'Delete list' }));
    settle();
    expect(stack()).toHaveLength(2);

    pressBack();
    expect(dialog('Delete Groceries?')).toBeNull();
    expect(dialog('Groceries')).toBeTruthy();

    pressBack();
    expect(dialog('Groceries')).toBeNull();
    expect(stack()).toHaveLength(0);
  });

  it('gives both entries back in one step when its yes closes the sheet as well', () => {
    const go = vi.spyOn(window.history, 'go');
    render(<SheetWithConfirm />);
    settle();
    fireEvent.click(screen.getByRole('button', { name: 'Delete list' }));
    settle();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    settle();
    expect(dialog('Groceries')).toBeNull();
    // Nothing of the sheets' left: the next Back belongs to the page.
    expect(stack()).toHaveLength(0);
    expect(go).toHaveBeenCalledWith(-2);
    go.mockRestore();
  });
});

describe('a sheet swapped for another', () => {
  it('needs one Back to close the second, with no dead step after it', () => {
    function FolderSheets() {
      const [which, setWhich] = useState<'menu' | 'rename' | null>('menu');
      return (
        <>
          {which === 'menu' && (
            <BottomSheet title="Holiday" onClose={() => setWhich(null)}>
              <button type="button" onClick={() => setWhich('rename')}>Rename</button>
            </BottomSheet>
          )}
          {which === 'rename' && <BottomSheet title="Rename Holiday" onClose={() => setWhich(null)}><input aria-label="Name" /></BottomSheet>}
        </>
      );
    }
    render(<FolderSheets />);
    settle();
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    settle();
    expect(dialog('Rename Holiday')).toBeTruthy();

    pressBack();
    expect(dialog('Rename Holiday')).toBeNull();
    expect(stack()).toHaveLength(0);
  });
});

describe('a sheet that stays mounted (Settings)', () => {
  function Settings() {
    const [open, setOpen] = useState(false);
    const [family, setFamily] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>open settings</button>
        <SlideUpSheet open={open} onClose={() => setOpen(false)} title="Settings" closeLabel="Close settings" maxHeight="70dvh" covered={family}>
          <button type="button" onClick={() => setFamily(true)}>Family</button>
        </SlideUpSheet>
        {open && family && <FormOverlay title="Family" onBack={() => setFamily(false)}><span /></FormOverlay>}
      </>
    );
  }

  it('holds an entry only while it is up, and gives Back to a page opened from it first', () => {
    render(<Settings />);
    settle();
    expect(stack()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'open settings' }));
    settle();
    expect(stack()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Family' }));
    settle();
    expect(stack()).toHaveLength(2);

    pressBack();
    act(() => { vi.advanceTimersByTime(300); });
    expect(dialog('Family')).toBeNull();
    const settings = screen.getByRole('dialog', { name: 'Settings', hidden: true });
    expect(settings.hasAttribute('inert')).toBe(false);
    expect(stack()).toHaveLength(1);

    pressBack();
    expect(settings.hasAttribute('inert')).toBe(true);
    expect(stack()).toHaveLength(0);
  });

  it('gives its entry back when its own close control shuts it', () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: 'open settings' }));
    settle();
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    settle();
    expect(stack()).toHaveLength(0);
  });
});

describe('a sheet that cannot close just now', () => {
  it('stays on Back and keeps its entry, while it keeps a picture', () => {
    render(<SheetFrame layer="sheetOverSheet" label="Keeping your picture"><span /></SheetFrame>);
    settle();
    pressBack();
    expect(dialog('Keeping your picture')).toBeTruthy();
    expect(stack()).toHaveLength(1);
  });
});
