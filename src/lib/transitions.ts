import type { TransitionEffect } from '@/types/config';

export interface TransitionOption {
  value: TransitionEffect;
  label: string;
}

/** Dropdown choices for the transition-effect picker (Defaults + per-display). */
export const TRANSITION_OPTIONS: readonly TransitionOption[] = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'slide-up', label: 'Slide Up' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'flip', label: '3D Flip' },
  { value: 'blur', label: 'Blur' },
  { value: 'crossfade', label: 'Crossfade (overlap)' },
  { value: 'none', label: 'None (instant)' },
];

export interface TransitionConfig {
  /** Duration in seconds */
  duration: number;
  /** CSS easing function */
  easing: string;
}

/**
 * Returns CSS animation configuration for screen transitions.
 *
 * All keyframes use compositor-only properties (transform, opacity) via
 * translate3d / scale3d so animations run on the GPU compositor thread
 * instead of the main JavaScript thread. This is critical for smooth
 * 60fps transitions on low-powered devices like Raspberry Pi.
 *
 * The one exception is 'blur' which uses the CSS filter property — this
 * triggers paint but the radius is kept small (8px) to limit cost.
 */
export function getTransitionConfig(
  effect: TransitionEffect = 'fade',
  duration: number = 0.6,
): TransitionConfig {
  if (effect === 'none') {
    return { duration: 0, easing: 'ease-in-out' };
  }

  return { duration, easing: 'ease-in-out' };
}

/**
 * Which way a navigation is headed, used to mirror directional transition
 * effects. Forward (next screen, auto-rotation) keeps each effect's natural
 * direction; backward (previous screen) mirrors `slide`, `slide-up`, and
 * `flip` so the animation matches the navigation — a swipe right (back)
 * slides the old screen out to the right. Non-directional effects (fade,
 * crossfade, zoom, blur) ignore this.
 */
export type TransitionDirection = 'forward' | 'backward';

/**
 * Returns WAAPI-compatible Keyframe arrays for use with the View Transitions
 * API. View Transitions animate GPU-backed screenshots (flat textures) rather
 * than live DOM, making them dramatically cheaper for the compositor — critical
 * for smooth transitions at high resolutions on Raspberry Pi.
 */
export function getViewTransitionKeyframes(
  effect: TransitionEffect = 'fade',
  direction: TransitionDirection = 'forward',
) {
  const gpu = 'translate3d(0,0,0)';
  const back = direction === 'backward';

  const enter: Keyframe[] = (() => {
    switch (effect) {
      case 'slide':
        return [
          { opacity: 0, transform: back ? 'translate3d(-100%,0,0)' : 'translate3d(100%,0,0)' },
          { opacity: 1, transform: gpu },
        ];
      case 'slide-up':
        return [
          { opacity: 0, transform: back ? 'translate3d(0,-100%,0)' : 'translate3d(0,100%,0)' },
          { opacity: 1, transform: gpu },
        ];
      case 'zoom':
        return [
          { opacity: 0, transform: 'scale3d(0.8,0.8,1)' },
          { opacity: 1, transform: 'scale3d(1,1,1)' },
        ];
      case 'flip':
        return [
          { opacity: 0, transform: `perspective(1200px) rotateY(${back ? -90 : 90}deg)` },
          { opacity: 1, transform: 'perspective(1200px) rotateY(0deg)' },
        ];
      case 'blur':
        return [
          { opacity: 0, filter: 'blur(8px)', transform: gpu },
          { opacity: 1, filter: 'blur(0px)', transform: gpu },
        ];
      case 'fade':
      case 'crossfade':
      default:
        return [
          { opacity: 0, transform: gpu },
          { opacity: 1, transform: gpu },
        ];
    }
  })();

  const exit: Keyframe[] = (() => {
    switch (effect) {
      case 'slide':
        return [
          { opacity: 1, transform: gpu },
          { opacity: 0, transform: back ? 'translate3d(100%,0,0)' : 'translate3d(-100%,0,0)' },
        ];
      case 'slide-up':
        return [
          { opacity: 1, transform: gpu },
          { opacity: 0, transform: back ? 'translate3d(0,100%,0)' : 'translate3d(0,-100%,0)' },
        ];
      case 'zoom':
        return [
          { opacity: 1, transform: 'scale3d(1,1,1)' },
          { opacity: 0, transform: 'scale3d(1.2,1.2,1)' },
        ];
      case 'flip':
        return [
          { opacity: 1, transform: 'perspective(1200px) rotateY(0deg)' },
          { opacity: 0, transform: `perspective(1200px) rotateY(${back ? 90 : -90}deg)` },
        ];
      case 'blur':
        return [
          { opacity: 1, filter: 'blur(0px)', transform: gpu },
          { opacity: 0, filter: 'blur(8px)', transform: gpu },
        ];
      case 'fade':
      case 'crossfade':
      default:
        return [
          { opacity: 1, transform: gpu },
          { opacity: 0, transform: gpu },
        ];
    }
  })();

  return { enter, exit };
}
