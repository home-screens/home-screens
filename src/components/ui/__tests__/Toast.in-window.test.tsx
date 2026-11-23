// @vitest-environment jsdom

/**
 * A toast raised from inside a window (the meal planner's Undo after
 * "Clear week").
 *
 * A window keeps Tab inside itself. A toast drawn in the page's stack is
 * outside it, so its Undo could be clicked but never reached from the
 * keyboard. A window's toasts are drawn inside the window; the page's own
 * toasts stay in the page's stack.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));

import CRUDModalShell from '@/components/editor/CRUDModalShell';
import ModalFrame from '../ModalFrame';
import Toast, { ToastStack } from '../Toast';
import { FOCUSABLE } from '@/hooks/useFocusTrap';

afterEach(cleanup);

/** The editor with the page's stack, a toast of the page's own, and the meal planner open with its Undo toast. */
function Editor({ undo = () => {} }: { undo?: () => void }) {
  return (
    <>
      <ToastStack />
      <Toast message="Back up your settings" action={{ label: 'Back up now', onClick: () => {} }} />
      <CRUDModalShell title="Meal planner" onClose={() => {}}>
        <button type="button">Clear week</button>
        <Toast message="Week cleared" action={{ label: 'Undo', onClick: undo }} />
      </CRUDModalShell>
    </>
  );
}

/** Press Tab the way the browser does: the trap gets the key, and unless it moved focus itself the next stop takes it. */
function tab(trap: HTMLElement) {
  const stops = [...trap.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const from = document.activeElement as HTMLElement;
  const moved = !fireEvent.keyDown(from, { key: 'Tab' });
  if (!moved) stops[stops.indexOf(from) + 1]?.focus();
}

describe('a toast raised inside a window', () => {
  it('is drawn inside the window, and the page’s own toast stays in the page’s stack', async () => {
    render(<Editor />);
    const dialog = await screen.findByRole('dialog');
    const undo = screen.getByRole('button', { name: 'Undo' });
    const pageStack = screen.getByTestId('toast-stack');

    expect(dialog.contains(undo)).toBe(true);
    expect(pageStack.contains(undo)).toBe(false);

    const backUp = screen.getByRole('button', { name: 'Back up now' });
    expect(pageStack.contains(backUp)).toBe(true);
    expect(dialog.contains(backUp)).toBe(false);
  });

  it('can be reached and pressed from the keyboard: Tab walks to its Undo before wrapping', async () => {
    const undo = vi.fn();
    render(<Editor undo={undo} />);
    const dialog = await screen.findByRole('dialog');
    const button = screen.getByRole('button', { name: 'Undo' });
    const trap = button.closest('[data-testid="window-toast-stack"]')!.parentElement!;

    const visited: string[] = [];
    for (let i = 0; i < 8 && document.activeElement !== button; i += 1) {
      tab(trap);
      visited.push(document.activeElement?.textContent ?? '');
    }
    expect(document.activeElement).toBe(button);
    expect(dialog.contains(document.activeElement)).toBe(true);
    // Never onto the page behind the window.
    expect(visited).not.toContain('Back up now');
    fireEvent.click(button);
    expect(undo).toHaveBeenCalledTimes(1);

    // Undo is the last stop, so the next Tab wraps to the first one in the window.
    tab(trap);
    expect(trap.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(button);
  });

  it('goes to the innermost window when one is open over another', async () => {
    render(
      <>
        <ToastStack />
        <ModalFrame label="Outer" onClose={() => {}}>
          <Toast message="From the outer window" />
          <ModalFrame label="Inner" onClose={() => {}}>
            <Toast message="From the inner window" />
          </ModalFrame>
        </ModalFrame>
      </>,
    );
    const inner = await screen.findByRole('dialog', { name: 'Inner' });
    const outer = screen.getByRole('dialog', { name: 'Outer' });
    expect(inner.contains(screen.getByText('From the inner window'))).toBe(true);
    expect(inner.contains(screen.getByText('From the outer window'))).toBe(false);
    expect(outer.contains(screen.getByText('From the outer window'))).toBe(true);
    expect(screen.getByTestId('toast-stack').children).toHaveLength(0);
  });

  /** The window stack's placement with the window's bottom edge `roomBelow` px above the bottom of a 768 px screen. */
  async function placedWith(roomBelow: number) {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { top: 20, bottom: 768 - roomBelow, left: 0, right: 600, width: 600, height: 748 - roomBelow, x: 0, y: 20, toJSON: () => ({}) } as DOMRect;
    });
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    try {
      render(<Editor />);
      await screen.findByRole('dialog');
      const stack = screen.getByTestId('window-toast-stack');
      return { atTop: stack.dataset.atTop === 'true', top: stack.style.top, bottom: stack.style.bottom };
    } finally {
      rect.mockRestore();
      vi.unstubAllGlobals();
    }
  }

  it('goes to the top of the screen when a toast would not fit under the window', async () => {
    expect(await placedWith(40)).toEqual({ atTop: true, top: '16px', bottom: '' });
  });

  it('stays at the bottom when a toast fits under the window', async () => {
    // A 1080p screen leaves about 80 px under the meal planner.
    expect(await placedWith(100)).toEqual({ atTop: false, top: '', bottom: '16px' });
  });
});
