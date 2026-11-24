import { describe, it, expect } from 'vitest';
import { CHANGEOVER_WINDOW_MS, WINDOW_WALLS_PER_DISPLAY, admitWithoutAsking, isWindowOpen, type AdmissionFacts } from '../display-admission';

/** A stranger on a hub with a password, long after the update: nothing lets them in. */
const stranger: AdmissionFacts = {
  passwordSet: true,
  holdsKey: false,
  hubOwnScreen: false,
  allowedNetwork: false,
  windowOpen: false,
  displayAdopted: true,
  windowAdmissions: 0,
};

describe('admitWithoutAsking', () => {
  it('lets every browser in when no password is set', () => {
    expect(admitWithoutAsking({ ...stranger, passwordSet: false })).toBe('no-password');
  });

  it('makes a stranger wait on a hub with a password', () => {
    expect(admitWithoutAsking(stranger)).toBeNull();
  });

  it('moves a page that still holds the key over, during the window', () => {
    expect(admitWithoutAsking({ ...stranger, holdsKey: true, windowOpen: true })).toBe('old-key');
  });

  it('no longer trades the key for a cookie once the window has closed', () => {
    // The key itself still works for that page and for automations; it just
    // stops being a way to become a wall that outlives "Make a new key".
    expect(admitWithoutAsking({ ...stranger, holdsKey: true })).toBeNull();
  });

  it('lets the hub\'s own screen in', () => {
    expect(admitWithoutAsking({ ...stranger, hubOwnScreen: true })).toBe('hub-screen');
  });

  it('lets a device on an allowed network in', () => {
    expect(admitWithoutAsking({ ...stranger, allowedNetwork: true })).toBe('allowed-network');
  });

  it('lets an existing display\'s wall in during the window', () => {
    expect(admitWithoutAsking({ ...stranger, windowOpen: true })).toBe('window');
  });

  it('does not open the window for a display the hub does not have', () => {
    expect(admitWithoutAsking({ ...stranger, windowOpen: true, displayAdopted: false })).toBeNull();
  });

  it('stops at four window walls per display', () => {
    expect(admitWithoutAsking({ ...stranger, windowOpen: true, windowAdmissions: WINDOW_WALLS_PER_DISPLAY - 1 })).toBe('window');
    expect(admitWithoutAsking({ ...stranger, windowOpen: true, windowAdmissions: WINDOW_WALLS_PER_DISPLAY })).toBeNull();
  });

  it('remembers the hub\'s own screen as that, not as a window wall, so it never uses up the window', () => {
    expect(admitWithoutAsking({ ...stranger, hubOwnScreen: true, windowOpen: true })).toBe('hub-screen');
  });

  it('prefers the key over everything else on a password hub, so a signed-in tablet wall is moved over too', () => {
    expect(admitWithoutAsking({ ...stranger, holdsKey: true, windowOpen: true, hubOwnScreen: true, allowedNetwork: true })).toBe('old-key');
  });
});

describe('isWindowOpen', () => {
  const start = Date.UTC(2026, 10, 1);

  it('is open from the moment it starts until thirty days later', () => {
    expect(isWindowOpen(start, start)).toBe(true);
    expect(isWindowOpen(start, start + CHANGEOVER_WINDOW_MS - 1)).toBe(true);
    expect(isWindowOpen(start, start + CHANGEOVER_WINDOW_MS)).toBe(false);
  });

  it('is never open on a hub that had nothing to move over', () => {
    expect(isWindowOpen(null, start)).toBe(false);
    expect(isWindowOpen(undefined, start)).toBe(false);
  });

  it('is not open before its own start (a clock set back)', () => {
    expect(isWindowOpen(start, start - 1)).toBe(false);
  });
});
