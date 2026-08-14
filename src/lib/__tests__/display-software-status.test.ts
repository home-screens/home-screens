import { describe, it, expect } from 'vitest';
import {
  buildDisplaySoftwareSetupCommand,
  buildDisplaySshCommand,
  resolveDisplaySoftwareState,
} from '@/lib/display-software-status';

describe('resolveDisplaySoftwareState', () => {
  it('reports nothing when no reporter has ever run', () => {
    // Distinct from "no updater": the hub simply has no information.
    expect(resolveDisplaySoftwareState(undefined, '1.9.0')).toEqual({ kind: 'unreported' });
  });

  it('flags a Pi that predates automatic updates', () => {
    // An old reporter omits both fields, which validates to updater=false —
    // the same answer as a new reporter finding no updater installed.
    expect(resolveDisplaySoftwareState({ updater: false, version: null }, '1.9.0')).toEqual({
      kind: 'needs-setup',
    });
  });

  it('shows a freshly installed Pi as getting ready, not out of date', () => {
    expect(resolveDisplaySoftwareState({ updater: true, version: null }, '1.9.0')).toEqual({
      kind: 'pending',
    });
  });

  it('matches the hub version', () => {
    expect(resolveDisplaySoftwareState({ updater: true, version: '1.9.0' }, '1.9.0')).toEqual({
      kind: 'current',
      version: '1.9.0',
    });
  });

  it('flags a version behind the hub', () => {
    expect(resolveDisplaySoftwareState({ updater: true, version: '1.8.0' }, '1.9.0')).toEqual({
      kind: 'outdated',
      version: '1.8.0',
      hubVersion: '1.9.0',
    });
  });

  it('does not claim a mismatch before the hub version is known', () => {
    // The poll that carries hubVersion may not have landed yet. "We don't
    // know" must not render as "out of date" and prompt a needless worry.
    expect(resolveDisplaySoftwareState({ updater: true, version: '1.8.0' }, undefined)).toEqual({
      kind: 'current',
      version: '1.8.0',
    });
  });
});

describe('buildDisplaySoftwareSetupCommand', () => {
  it('builds a runnable one-liner from the editor origin', () => {
    expect(buildDisplaySoftwareSetupCommand('http://192.168.1.10:3000', 'kitchen')).toBe(
      'curl -fsS "http://192.168.1.10:3000/api/display/kiosk-bootstrap?display=kitchen" | bash',
    );
  });

  it('does not double the slash on an origin with a trailing one', () => {
    expect(buildDisplaySoftwareSetupCommand('http://hub:3000/', 'den')).toContain(
      'http://hub:3000/api/display/kiosk-bootstrap?display=den',
    );
  });
});

describe('buildDisplaySshCommand', () => {
  it('builds the connect command from the heartbeat address', () => {
    // The address is where the display's own browser checked in from, so the
    // user is handed the machine actually rendering the screen rather than
    // being sent to hunt through a router.
    expect(buildDisplaySshCommand('192.168.86.175')).toBe('ssh hs@192.168.86.175');
  });

  it('returns null when the display has never checked in', () => {
    // A command containing a placeholder is worse than none: it copies
    // cleanly and then fails in the user's terminal.
    expect(buildDisplaySshCommand(null)).toBeNull();
    expect(buildDisplaySshCommand(undefined)).toBeNull();
    expect(buildDisplaySshCommand('')).toBeNull();
  });
});
