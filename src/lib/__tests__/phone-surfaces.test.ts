import { describe, it, expect } from 'vitest';
import {
  PHONE_CONTEXTS,
  SURFACES_BY_CONTEXT,
  phoneSurfaceLabel,
  phoneSurfaceUrl,
} from '@/lib/phone-surfaces';

describe('phone surfaces', () => {
  describe('context → surface routing', () => {
    /**
     * The bug this table exists to prevent: pointing "check off chores" at
     * `/remote`, which is password-protectable and whose chore tab is the
     * parent's management view. A kid needs `/chores`.
     */
    it('offers the kid surface first for chores, and only the parent one elsewhere', () => {
      expect(SURFACES_BY_CONTEXT.chores).toEqual(['chores', 'remote']);
      expect(SURFACES_BY_CONTEXT.meals).toEqual(['remote']);
      expect(SURFACES_BY_CONTEXT.photos).toEqual(['remote']);
    });

    it('covers every declared context', () => {
      for (const context of PHONE_CONTEXTS) {
        expect(SURFACES_BY_CONTEXT[context].length).toBeGreaterThan(0);
      }
    });
  });

  describe('phoneSurfaceUrl', () => {
    it('joins the origin the editor was reached on to the surface path', () => {
      expect(phoneSurfaceUrl('chores', 'http://homescreens.local:3000')).toBe(
        'http://homescreens.local:3000/chores',
      );
      expect(phoneSurfaceUrl('remote', 'http://192.168.1.40:3000')).toBe(
        'http://192.168.1.40:3000/remote',
      );
    });

    it('falls back to the bare path before the origin is known', () => {
      // Pre-mount `useOrigin` returns ''. A bare path is still a working
      // same-origin link, which is what the chip renders as an href.
      expect(phoneSurfaceUrl('chores', '')).toBe('/chores');
      expect(phoneSurfaceUrl('remote', '')).toBe('/remote');
    });
  });

  describe('phoneSurfaceLabel', () => {
    it('strips the scheme so the host and path survive a narrow column', () => {
      expect(phoneSurfaceLabel('remote', 'http://homescreens.local:3000')).toBe(
        'homescreens.local:3000/remote',
      );
      expect(phoneSurfaceLabel('chores', 'https://homescreens.local')).toBe(
        'homescreens.local/chores',
      );
    });

    it('leaves a bare path alone', () => {
      expect(phoneSurfaceLabel('remote', '')).toBe('/remote');
    });
  });
});
