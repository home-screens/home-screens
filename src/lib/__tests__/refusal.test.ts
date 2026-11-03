import { describe, expect, it } from 'vitest';
import { RefusalError, isRefusalBody, refusalBody, refusalFromBody } from '../refusal';
import { refusalText, HubUnreachableError, refusalError } from '../hub-request';
import type { TranslateFn } from '@/i18n/types';

/** A dictionary in miniature: the phone's German for two refusal codes. */
const t: TranslateFn = (key, vars) => {
  if (key === 'refusals.lists.nameTooLong') return `Listennamen dürfen bis zu ${vars?.max} Zeichen lang sein`;
  if (key === 'refusals.lists.failed') return 'Etwas ist schiefgelaufen.';
  if (key === 'hubRequest.saveFailed') return 'Home Screens war nicht erreichbar.';
  // `useTranslate` answers a miss with the key itself.
  return key;
};

describe('RefusalError', () => {
  it('carries status, code, params and the English sentence, and answers as a body', () => {
    const error = new RefusalError(400, 'lists.nameTooLong', 'List names can be up to 60 characters', { params: { max: 60 } });
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'RefusalError', status: 400, code: 'lists.nameTooLong', params: { max: 60 } });
    expect(refusalBody(error)).toEqual({ error: 'List names can be up to 60 characters', code: 'lists.nameTooLong', params: { max: 60 } });
  });

  it('spreads what it carries beside the refusal into the body', () => {
    const error = new RefusalError(409, 'family.revision', 'Changed', { extra: { members: [], revision: 'r2' } });
    expect(refusalBody(error)).toEqual({ error: 'Changed', code: 'family.revision', members: [], revision: 'r2' });
    expect(error.params).toBeUndefined();
  });

  it('is read back off a body only when the body names a code', () => {
    expect(isRefusalBody({ error: 'x', code: 'lists.listGone' })).toBe(true);
    expect(isRefusalBody({ error: 'x' })).toBe(false);
    expect(isRefusalBody({ error: 'x', code: '' })).toBe(false);
    expect(isRefusalBody(null)).toBe(false);
    expect(isRefusalBody('lists.listGone')).toBe(false);

    const read = refusalFromBody({ error: 'That list is gone', code: 'lists.listGone', params: { max: 1 } }, 404, 'fallback');
    expect(read).toBeInstanceOf(RefusalError);
    expect(read).toMatchObject({ status: 404, code: 'lists.listGone', params: { max: 1 }, message: 'That list is gone' });
    expect(refusalFromBody({ code: 'lists.listGone' }, 404, 'fallback')?.message).toBe('fallback');
    expect(refusalFromBody({ error: 'no code' }, 400, 'fallback')).toBeNull();
  });

  it('becomes a RefusalError when the hub named a code, a plain error otherwise', () => {
    expect(refusalError({ error: 'Gone', code: 'lists.listGone' }, 404, 'fallback')).toBeInstanceOf(RefusalError);
    const plain = refusalError({ error: 'Expected an object' }, 400, 'fallback');
    expect(plain).not.toBeInstanceOf(RefusalError);
    expect(plain.message).toBe('Expected an object');
    expect(refusalError(null, 500, 'fallback').message).toBe('fallback');
  });
});

describe('refusalText', () => {
  it('shows the dictionary sentence for a known code, with its params filled in', () => {
    const thrown = new RefusalError(400, 'lists.nameTooLong', 'List names can be up to 60 characters', { params: { max: 60 } });
    expect(refusalText(thrown, t, 'refusals.lists.failed')).toBe('Listennamen dürfen bis zu 60 Zeichen lang sein');
    // The hub's answer body works the same way as the error a client threw.
    expect(refusalText({ error: 'List names can be up to 60 characters', code: 'lists.nameTooLong', params: { max: 60 } }, t, 'refusals.lists.failed'))
      .toBe('Listennamen dürfen bis zu 60 Zeichen lang sein');
  });

  it('falls back for a code the dictionary does not know, and never shows the hub sentence', () => {
    const unknown = new RefusalError(400, 'lists.somethingNew', 'A sentence only the hub knows');
    expect(refusalText(unknown, t, 'refusals.lists.failed')).toBe('Etwas ist schiefgelaufen.');
    expect(refusalText({ error: 'A sentence only the hub knows', code: 'lists.somethingNew' }, t, 'refusals.lists.failed')).toBe('Etwas ist schiefgelaufen.');
  });

  it('falls back for a plain failure, an answer without a code, or nothing at all', () => {
    expect(refusalText(new Error('Failed to fetch'), t, 'refusals.lists.failed')).toBe('Etwas ist schiefgelaufen.');
    expect(refusalText({ error: 'Expected an object' }, t, 'refusals.lists.failed')).toBe('Etwas ist schiefgelaufen.');
    expect(refusalText(null, t, 'refusals.lists.failed')).toBe('Etwas ist schiefgelaufen.');
    expect(refusalText(undefined, t, 'refusals.lists.failed')).toBe('Etwas ist schiefgelaufen.');
  });

  it('shows its own sentence for a hub out of reach, the fallback when none is given', () => {
    expect(refusalText(new HubUnreachableError(), t, 'refusals.lists.failed', 'hubRequest.saveFailed')).toBe('Home Screens war nicht erreichbar.');
    expect(refusalText(new HubUnreachableError(), t, 'refusals.lists.failed')).toBe('Etwas ist schiefgelaufen.');
  });
});
