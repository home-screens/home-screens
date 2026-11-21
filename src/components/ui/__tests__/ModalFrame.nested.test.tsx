// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import ModalFrame from '../ModalFrame';

afterEach(cleanup);

function press() {
  fireEvent.keyDown(window, { key: 'Escape' });
}

describe('a ModalFrame opened from inside another', () => {
  it('is the only one that answers Escape', async () => {
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    render(
      <ModalFrame label="Outer" onClose={closeOuter}>
        <p>outer</p>
        <ModalFrame label="Inner" onClose={closeInner}>
          <p>inner</p>
        </ModalFrame>
      </ModalFrame>,
    );
    await screen.findByText('inner');

    press();
    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });

  it('keeps the one underneath open while it is busy', async () => {
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    render(
      <ModalFrame label="Outer" onClose={closeOuter}>
        <ModalFrame label="Inner" onClose={closeInner} closable={false}>
          <p>inner</p>
        </ModalFrame>
      </ModalFrame>,
    );
    await screen.findByText('inner');

    press();
    expect(closeInner).not.toHaveBeenCalled();
    expect(closeOuter).not.toHaveBeenCalled();
  });

  it('hands Escape back once it has closed', async () => {
    const closeOuter = vi.fn();
    const view = render(
      <ModalFrame label="Outer" onClose={closeOuter}>
        <ModalFrame label="Inner" onClose={() => {}}>
          <p>inner</p>
        </ModalFrame>
      </ModalFrame>,
    );
    await screen.findByText('inner');
    view.rerender(
      <ModalFrame label="Outer" onClose={closeOuter}>
        <p>alone</p>
      </ModalFrame>,
    );

    press();
    expect(closeOuter).toHaveBeenCalledTimes(1);
  });
});
