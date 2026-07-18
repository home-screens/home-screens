// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import ConditionTreeEditor from '../ConditionTreeEditor';
import type { TranslateFn } from '@/i18n';
import type { VisibilityCondition } from '@/types/config';

/**
 * Structural edits on the condition tree: adding children to a group and the
 * group-collapse rule — a group must keep at least one child, so removing the
 * last child removes the group itself rather than leaving an unsaveable empty
 * group (the validator rejects `conditions: []` on and/or/not).
 */

const t = ((key: string) => key) as TranslateFn;

// Blank leaves keep useStateKeyDescriptor on its synchronous null
// short-circuit — no async descriptor lookups to flush.
const leaf = (): VisibilityCondition => ({ kind: 'state', sourceKey: '', equals: '' });

function renderTree(conditions: VisibilityCondition[], onChange: (next: VisibilityCondition[]) => void) {
  return render(
    <ConditionTreeEditor conditions={conditions} onChange={onChange} options={[]} t={t} />,
  );
}

afterEach(cleanup);

describe('ConditionTreeEditor group structure', () => {
  it('adds a blank state condition at the root', () => {
    const onChange = vi.fn();
    const { getByRole } = renderTree([], onChange);
    fireEvent.click(getByRole('button', { name: /addCondition/ }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      { kind: 'state', sourceKey: '', equals: '' },
    ]);
  });

  it('adds a blank child to a group via the group-level add button', () => {
    const onChange = vi.fn();
    const group: VisibilityCondition = { kind: 'and', conditions: [leaf()] };
    const { getAllByRole } = renderTree([group], onChange);
    // First add button belongs to the group, the last to the root.
    fireEvent.click(getAllByRole('button', { name: /addCondition/ })[0]);
    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      { kind: 'and', conditions: [leaf(), leaf()] },
    ]);
  });

  it('removing one of several children keeps the group', () => {
    const onChange = vi.fn();
    const group: VisibilityCondition = {
      kind: 'or',
      conditions: [
        { kind: 'state', sourceKey: '', equals: 'a' },
        { kind: 'state', sourceKey: '', equals: 'b' },
      ],
    };
    const { getAllByRole } = renderTree([group], onChange);
    // Remove buttons render group-first, then one per child.
    fireEvent.click(getAllByRole('button', { name: /removeCondition/ })[1]);
    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      { kind: 'or', conditions: [{ kind: 'state', sourceKey: '', equals: 'b' }] },
    ]);
  });

  it('removing the LAST child removes the whole group', () => {
    const onChange = vi.fn();
    const group: VisibilityCondition = { kind: 'not', conditions: [leaf()] };
    const { getAllByRole } = renderTree([group], onChange);
    fireEvent.click(getAllByRole('button', { name: /removeCondition/ })[1]);
    expect(onChange).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('a nested group collapsing leaves its parent intact', () => {
    const onChange = vi.fn();
    const inner: VisibilityCondition = { kind: 'and', conditions: [leaf()] };
    const outer: VisibilityCondition = { kind: 'or', conditions: [inner, leaf()] };
    const { getAllByRole } = renderTree([outer], onChange);
    // Buttons in DOM order: outer group, inner group, inner's leaf, outer's second leaf.
    fireEvent.click(getAllByRole('button', { name: /removeCondition/ })[2]);
    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      { kind: 'or', conditions: [leaf()] },
    ]);
  });
});
