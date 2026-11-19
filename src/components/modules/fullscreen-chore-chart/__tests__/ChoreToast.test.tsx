// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import modules from '@/translations/en-US/modules.json';
import ChoreToast, { type ToastItem } from '../ChoreToast';

/**
 * The fullscreen chart's strip has to carry the same warning the card chart
 * puts at its foot: un-ticking gives tickets back that may already be spent,
 * and a balance going below zero with nothing on screen is the bug the card
 * was fixed for.
 */

const toast: ToastItem = {
  id: '1', choreId: 'chore-1', memberId: 'kid-1', choreName: 'Load the dishwasher',
  memberName: 'Noah', memberColor: '#8b5cf6', wasCompleted: true,
};

function renderStrip(props: Partial<React.ComponentProps<typeof ChoreToast>>) {
  render(
    <I18nProvider locale="en-US" blob={{ modules }}>
      <ChoreToast toasts={[]} onDismiss={vi.fn()} onUndo={vi.fn()} {...props} />
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe('the strip carries an overspent balance', () => {
  it('shows the notice on its own, with no chore toast in flight', () => {
    renderStrip({ notice: 'Noah already spent those tickets, so the balance is now -4. 4 more tickets to earn.' });

    expect(screen.getByTestId('chore-overspent-toast').textContent)
      .toContain('the balance is now -4');
  });

  it('shows it alongside the toast for the tap that caused it', () => {
    renderStrip({ toasts: [toast], notice: 'Noah already spent those tickets, so the balance is now -1. 1 more ticket to earn.' });

    expect(screen.getByTestId('chore-overspent-toast')).not.toBeNull();
    expect(screen.getByText('Load the dishwasher')).not.toBeNull();
  });

  it('offers no undo on the notice, which is a statement rather than an action', () => {
    renderStrip({ notice: 'Noah already spent those tickets, so the balance is now -4. 4 more tickets to earn.' });

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('draws nothing when there is neither a toast nor a notice', () => {
    const { container } = render(
      <I18nProvider locale="en-US" blob={{ modules }}>
        <ChoreToast toasts={[]} onDismiss={vi.fn()} onUndo={vi.fn()} />
      </I18nProvider>,
    );

    expect(container.textContent).toBe('');
  });
});

describe('a look-only wall', () => {
  // The strip is drawn there too, so a redemption made on a phone is said on
  // the wall. Nothing on it can be taken back from a wall nobody may touch.
  it('says a redemption with no undo', () => {
    renderStrip({ onUndo: undefined, toasts: [{ ...toast, id: 'redeem-1', choreId: '', choreName: 'Movie night', verb: 'redeemed' }] });

    expect(screen.getByText('Movie night')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('gives a chore toast no undo either', () => {
    renderStrip({ onUndo: undefined, toasts: [toast] });

    expect(screen.getByText('Load the dishwasher')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
