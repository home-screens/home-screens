// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import Toast, { ToastStack } from '../Toast';

afterEach(cleanup);

describe('Toast', () => {
  it('stacks every toast in the one stack instead of each claiming the same spot', () => {
    render(
      <>
        <ToastStack />
        <Toast message="Back up your settings" tone="warning" />
        <Toast message="Kitchen deleted" />
      </>,
    );
    const stack = screen.getByTestId('toast-stack');
    expect(within(stack).getByText('Back up your settings')).toBeTruthy();
    expect(within(stack).getByText('Kitchen deleted')).toBeTruthy();
    expect(stack.children).toHaveLength(2);
  });

  it('is announced: status by default, alert for a danger tone', () => {
    render(
      <>
        <Toast message="Saved" />
        <Toast message="That did not save" tone="danger" />
      </>,
    );
    expect(screen.getByRole('status').textContent).toContain('Saved');
    expect(screen.getByRole('alert').textContent).toContain('That did not save');
  });

  it('gives a warning its warning button, runs the action and waves off from a labelled ×', () => {
    const act = vi.fn();
    const dismiss = vi.fn();
    render(<Toast tone="warning" message="Update ready" action={{ label: 'Update', onClick: act }} onDismiss={dismiss} dismissLabel="Dismiss" />);
    const button = screen.getByRole('button', { name: 'Update' });
    expect(button.className).toContain('bg-hs-warning');
    fireEvent.click(button);
    expect(act).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('draws in place when there is no stack on the page', () => {
    const { container } = render(<Toast message="Alone" />);
    expect(container.textContent).toContain('Alone');
  });
});
