import { describe, it, expect } from 'vitest';
import { googleProjectOf, mayCancelAtGoogle } from '../google-grant-project';
import { HOSTED_CALENDAR_CLIENT_ID, HOSTED_PHOTOS_CLIENT_ID } from '../google-hosted';

describe('googleProjectOf', () => {
  it('reads the project number at the start of a client id', () => {
    expect(googleProjectOf('123456789012-abc123.apps.googleusercontent.com')).toBe('123456789012');
    expect(googleProjectOf('  42-x.apps.googleusercontent.com ')).toBe('42');
  });

  it('puts both of Home Screens\' own clients in one project', () => {
    expect(googleProjectOf(HOSTED_CALENDAR_CLIENT_ID)).not.toBeNull();
    expect(googleProjectOf(HOSTED_CALENDAR_CLIENT_ID)).toBe(googleProjectOf(HOSTED_PHOTOS_CLIENT_ID));
  });

  it('has no answer for anything else', () => {
    expect(googleProjectOf(null)).toBeNull();
    expect(googleProjectOf(undefined)).toBeNull();
    expect(googleProjectOf('')).toBeNull();
    expect(googleProjectOf('my-client')).toBeNull();
    expect(googleProjectOf('-123.apps.googleusercontent.com')).toBeNull();
  });
});

describe('mayCancelAtGoogle', () => {
  it('cancels when nothing else on the hub is signed in', () => {
    expect(mayCancelAtGoogle('111', [])).toBe(true);
    expect(mayCancelAtGoogle(null, [])).toBe(true);
  });

  it('keeps the sign-in at Google while another one on the hub comes from the same project', () => {
    expect(mayCancelAtGoogle('111', ['111'])).toBe(false);
  });

  it('cancels when the other sign-in comes from a different project', () => {
    expect(mayCancelAtGoogle('111', ['222'])).toBe(true);
  });

  it('treats a project it cannot tell as the same one', () => {
    expect(mayCancelAtGoogle(null, ['222'])).toBe(false);
    expect(mayCancelAtGoogle('111', [null])).toBe(false);
    expect(mayCancelAtGoogle('111', ['222', '111'])).toBe(false);
  });
});
