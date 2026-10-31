// @vitest-environment jsdom

/**
 * The family empty state prints the hub's phone address only where its hint
 * asks for it with `{url}`. A hint pointing somewhere else ("in Settings on
 * the computer") or with nothing to do ("Rewards show up here...") once had
 * the address run onto its last word.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

vi.mock('@/hooks/useOrigin', () => ({ useOrigin: () => 'http://192.168.1.20:3000' }));

import FamilyEmptyState from '../FamilyEmptyState';

afterEach(cleanup);

function hintText(hint: string): string {
  const { container } = render(<FamilyEmptyState icon="x" title="Title" hint={hint} />);
  return container.querySelectorAll('p')[1].textContent ?? '';
}

describe('FamilyEmptyState', () => {
  it('puts the phone address where the hint says {url}', () => {
    expect(hintText('Plan meals from a phone: open {url} and tap Meals'))
      .toBe('Plan meals from a phone: open 192.168.1.20:3000/remote and tap Meals');
  });

  it('shows a hint with no {url} as written', () => {
    expect(hintText('Connect it in Settings on the computer to show the meal plan.'))
      .toBe('Connect it in Settings on the computer to show the meal plan.');
  });
});
