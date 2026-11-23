import { describe, expect, it } from 'vitest';
import { confirmsBefore } from '../todo-actions';

// One rule for the phone's list sheet and the editor's list window.
describe('confirmsBefore', () => {
  it('asks before the done items go, and not before everything is unticked', () => {
    expect(confirmsBefore('clear-completed')).toBe(true);
    expect(confirmsBefore('uncheck-all')).toBe(false);
  });
});
