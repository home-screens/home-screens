import { describe, it, expect } from 'vitest';
import { getTransitionConfig, getViewTransitionKeyframes } from '../transitions';
import type { TransitionEffect } from '@/types/config';

describe('getTransitionConfig', () => {
  it('defaults to fade at 0.6s when called with no arguments', () => {
    const tc = getTransitionConfig();
    expect(tc.duration).toBe(0.6);
    expect(tc.easing).toBe('ease-in-out');
  });

  it('passes custom duration through', () => {
    const tc = getTransitionConfig('fade', 1.5);
    expect(tc.duration).toBe(1.5);
  });

  describe('none', () => {
    it('returns zero duration', () => {
      const tc = getTransitionConfig('none');
      expect(tc.duration).toBe(0);
    });

    it('ignores the duration parameter', () => {
      const tc = getTransitionConfig('none', 2.0);
      expect(tc.duration).toBe(0);
    });
  });

  it('all effects use ease-in-out easing', () => {
    const effects: TransitionEffect[] = ['fade', 'slide', 'slide-up', 'zoom', 'flip', 'blur', 'crossfade', 'none'];
    for (const effect of effects) {
      const tc = getTransitionConfig(effect);
      expect(tc.easing).toBe('ease-in-out');
    }
  });

  it('preserves custom duration for all non-none effects', () => {
    const effects: TransitionEffect[] = ['fade', 'slide', 'slide-up', 'zoom', 'flip', 'blur', 'crossfade'];
    for (const effect of effects) {
      const tc = getTransitionConfig(effect, 1.2);
      expect(tc.duration).toBe(1.2);
    }
  });
});

// ---------------------------------------------------------------------------
// getViewTransitionKeyframes
// ---------------------------------------------------------------------------
describe('getViewTransitionKeyframes', () => {
  const allEffects: TransitionEffect[] = ['fade', 'slide', 'slide-up', 'zoom', 'flip', 'blur', 'crossfade', 'none'];

  it('returns enter and exit arrays for all effects', () => {
    for (const effect of allEffects) {
      const { enter, exit } = getViewTransitionKeyframes(effect);
      expect(enter, `enter for ${effect}`).toBeInstanceOf(Array);
      expect(exit, `exit for ${effect}`).toBeInstanceOf(Array);
      expect(enter.length, `enter length for ${effect}`).toBeGreaterThanOrEqual(2);
      expect(exit.length, `exit length for ${effect}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('enter starts at opacity 0 and ends at opacity 1', () => {
    for (const effect of allEffects) {
      const { enter } = getViewTransitionKeyframes(effect);
      expect(enter[0].opacity, `enter start for ${effect}`).toBe(0);
      expect(enter[enter.length - 1].opacity, `enter end for ${effect}`).toBe(1);
    }
  });

  it('exit starts at opacity 1 and ends at opacity 0', () => {
    for (const effect of allEffects) {
      const { exit } = getViewTransitionKeyframes(effect);
      expect(exit[0].opacity, `exit start for ${effect}`).toBe(1);
      expect(exit[exit.length - 1].opacity, `exit end for ${effect}`).toBe(0);
    }
  });

  it('defaults to fade when called with no arguments', () => {
    const { enter, exit } = getViewTransitionKeyframes();
    // Fade uses simple translate3d(0,0,0) transform
    expect(enter[0].transform).toContain('translate3d(0,0,0)');
    expect(exit[0].transform).toContain('translate3d(0,0,0)');
  });

  describe('slide', () => {
    it('enters from right (100%,0,0) and exits to left (-100%,0,0)', () => {
      const { enter, exit } = getViewTransitionKeyframes('slide');
      expect(enter[0].transform).toContain('translate3d(100%,0,0)');
      expect(exit[exit.length - 1].transform).toContain('translate3d(-100%,0,0)');
    });
  });

  describe('slide-up', () => {
    it('enters from bottom (0,100%,0) and exits to top (0,-100%,0)', () => {
      const { enter, exit } = getViewTransitionKeyframes('slide-up');
      expect(enter[0].transform).toContain('translate3d(0,100%,0)');
      expect(exit[exit.length - 1].transform).toContain('translate3d(0,-100%,0)');
    });
  });

  describe('zoom', () => {
    it('enters scaled down (0.8) and exits scaled up (1.2)', () => {
      const { enter, exit } = getViewTransitionKeyframes('zoom');
      expect(enter[0].transform).toContain('scale3d(0.8,0.8,1)');
      expect(exit[exit.length - 1].transform).toContain('scale3d(1.2,1.2,1)');
    });
  });

  describe('flip', () => {
    it('uses perspective and rotateY', () => {
      const { enter, exit } = getViewTransitionKeyframes('flip');
      expect(enter[0].transform).toContain('perspective(1200px)');
      expect(enter[0].transform).toContain('rotateY(90deg)');
      expect(exit[exit.length - 1].transform).toContain('rotateY(-90deg)');
    });
  });

  describe('blur', () => {
    it('uses CSS filter property for blur effect', () => {
      const { enter, exit } = getViewTransitionKeyframes('blur');
      expect(enter[0].filter).toContain('blur(8px)');
      expect(enter[enter.length - 1].filter).toContain('blur(0px)');
      expect(exit[0].filter).toContain('blur(0px)');
      expect(exit[exit.length - 1].filter).toContain('blur(8px)');
    });
  });

  describe('crossfade', () => {
    it('behaves identically to fade', () => {
      const fade = getViewTransitionKeyframes('fade');
      const crossfade = getViewTransitionKeyframes('crossfade');
      expect(crossfade.enter).toEqual(fade.enter);
      expect(crossfade.exit).toEqual(fade.exit);
    });
  });

  it('all keyframes include GPU-accelerated transform hints', () => {
    // Every keyframe should have a transform property for compositor optimization
    for (const effect of allEffects) {
      const { enter, exit } = getViewTransitionKeyframes(effect);
      for (const kf of [...enter, ...exit]) {
        expect(kf.transform, `missing transform in ${effect}`).toBeDefined();
      }
    }
  });
});
