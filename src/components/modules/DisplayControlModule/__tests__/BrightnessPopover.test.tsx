// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BrightnessPopover } from '../BrightnessPopover';

afterEach(cleanup);

describe('BrightnessPopover', () => {
  it('renders a slider with the initial value', () => {
    render(<BrightnessPopover initial={72} onCommit={() => {}} onDismiss={() => {}} />);
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.value).toBe('72');
  });

  it('does not fire onCommit on every drag tick', () => {
    const onCommit = vi.fn();
    render(<BrightnessPopover initial={10} onCommit={onCommit} onDismiss={() => {}} />);
    const slider = screen.getByRole('slider');
    fireEvent.input(slider, { target: { value: '40' } });
    fireEvent.input(slider, { target: { value: '80' } });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('fires onCommit with the final value on pointerup', () => {
    const onCommit = vi.fn();
    render(<BrightnessPopover initial={10} onCommit={onCommit} onDismiss={() => {}} />);
    const slider = screen.getByRole('slider');
    fireEvent.input(slider, { target: { value: '80' } });
    fireEvent.pointerUp(slider);
    expect(onCommit).toHaveBeenCalledWith(80);
  });

  it('dismisses on outside click', () => {
    const onDismiss = vi.fn();
    render(
      <>
        <div data-testid="outside">outside</div>
        <BrightnessPopover initial={50} onCommit={() => {}} onDismiss={onDismiss} />
      </>,
    );
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onDismiss).toHaveBeenCalled();
  });
});
