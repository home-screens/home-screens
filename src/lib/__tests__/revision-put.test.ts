import { describe, expect, it } from 'vitest';
import { RefusalError, refusalBody } from '../refusal';
import { requireRevision, revisionConflict } from '../revision-put';

describe('requireRevision', () => {
  it('hands back the revision a save quoted', () => {
    expect(requireRevision('abc', 'chores')).toBe('abc');
  });

  it('refuses a save that quoted none, under the store\'s own code', () => {
    for (const missing of [undefined, null, '', 7]) {
      const failure = (() => { try { requireRevision(missing, 'chores'); } catch (e) { return e; } })();
      expect(failure).toBeInstanceOf(RefusalError);
      expect((failure as RefusalError).status).toBe(400);
      expect((failure as RefusalError).code).toBe('chores.reload');
    }
  });

  it('says the sentence the route gives it', () => {
    expect(() => requireRevision(undefined, 'meals', 'Reopen the meal planner and try again.')).toThrow('Reopen the meal planner and try again.');
  });
});

describe('revisionConflict', () => {
  it('answers 409 with the hub\'s copy beside the reason every client keys on', () => {
    const refusal = revisionConflict('rewards', 'Somebody else changed the rewards.', { rewards: [{ id: 'r1' }], revision: 'abc' });
    expect(refusal.status).toBe(409);
    expect(refusalBody(refusal)).toEqual({
      error: 'Somebody else changed the rewards.',
      code: 'rewards.revision',
      rewards: [{ id: 'r1' }],
      revision: 'abc',
      reason: 'revision',
    });
  });

  it('never lets the copy overwrite the reason', () => {
    expect(refusalBody(revisionConflict('meals', 'Changed', { reason: 'partial' })).reason).toBe('revision');
  });
});
