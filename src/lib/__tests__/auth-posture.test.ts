import { describe, it, expect } from 'vitest';
import { authPosture, hasPassword } from '../auth-posture';

describe('hasPassword', () => {
  it.each([
    ['the state the app writes with a password', { passwordHash: 'abc', salt: 's', cookieSecret: 'c' }, true],
    ['the state the app writes with none', { passwordHash: null, salt: null, cookieSecret: null }, false],
    // The three readers used to split on these two: the gate, the status
    // check and the guards each gave a different answer.
    ['a file with no passwordHash key', { ipAllowlist: [] }, false],
    ['an empty-string hash', { passwordHash: '', salt: '' }, false],
    // Nothing the app writes. Unreadable means locked, never open.
    ['a hash that is not text', { passwordHash: 5 }, true],
    ['a hash that is an object', { passwordHash: {} }, true],
    ['a file that is a list', [], true],
    ['a file that is null', null, true],
    ['a file that is a string', 'oops', true],
  ])('%s', (_name, raw, expected) => {
    expect(hasPassword(raw)).toBe(expected);
  });
});

describe('authPosture', () => {
  it('reads the access settings beside the password', () => {
    expect(authPosture({ passwordHash: 'h', ipAllowlist: ['10.0.0.0/8'], ipBypassAuth: true, ipRestrictAccess: true })).toEqual({
      enabled: true,
      ipAllowlist: ['10.0.0.0/8'],
      ipBypassAuth: true,
      ipRestrictAccess: true,
    });
  });

  it('drops allowlist entries that are not text and reads a non-boolean switch as off', () => {
    expect(authPosture({ passwordHash: null, ipAllowlist: ['10.0.0.0/8', 7, null, { a: 1 }], ipBypassAuth: 'yes', ipRestrictAccess: 1 })).toEqual({
      enabled: false,
      ipAllowlist: ['10.0.0.0/8'],
      ipBypassAuth: false,
      ipRestrictAccess: false,
    });
  });

  it('has no allowlist for a file that is not an object, and stays locked', () => {
    expect(authPosture(null)).toEqual({ enabled: true, ipAllowlist: [], ipBypassAuth: false, ipRestrictAccess: false });
  });
});
