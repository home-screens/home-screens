import { expect } from '@playwright/test';
import type { ConfigVariant } from './types';
import { child, redStyle } from './shared';

/**
 * Icon-module config-variant rows. The core.ts batch already covers
 * style (regular/brands), animation=spin, and iconBackground; these rows
 * finish the module's rendering surface: the remaining animation members,
 * color, rotation, flip, animation duration, and the scale/autoFit sizing.
 *
 * IconModule builds one `<i>` whose class list is
 * `fa fa-<style> fa-<name>` plus (when non-default) a rotation class
 * (`fa-rotate-<deg>`), a flip class (`fa-flip-*`), and an animation class
 * from ANIMATION_CLASS. Sizing lands as an inline `font-size: <n>cqmin`
 * (n = scale*100, locked to 85 when autoFit), and the animation timing as
 * the inline `--fa-animation-duration` custom property. Every asserted
 * class / style below is verified against src/components/modules/IconModule.tsx.
 */

/** Base config: solid star renders against fa-solid-900.woff2 (see registry note). */
const star = { iconName: 'star', style: 'solid' } as const;

/** The inline font-size string the component derives (`${scale*100}cqmin`). */
const fontSize = async (mod: Parameters<ConfigVariant['expect']>[0]): Promise<string> =>
  mod.locator('i').first().evaluate((el) => (el as HTMLElement).style.fontSize);

export const ICON_VARIANTS: ConfigVariant[] = [
  // -- animation members (ANIMATION_CLASS[member], joined onto the glyph class) --
  {
    type: 'icon', name: 'animation-spin-pulse', kind: 'network-free',
    config: { ...star, animation: 'spin-pulse' },
    expect: child('i.fa-spin-pulse.fa-star'),
  },
  {
    type: 'icon', name: 'animation-spin-reverse', kind: 'network-free',
    config: { ...star, animation: 'spin-reverse' },
    expect: child('i.fa-spin.fa-spin-reverse.fa-star'),
  },
  {
    type: 'icon', name: 'animation-beat', kind: 'network-free',
    config: { ...star, animation: 'beat' },
    expect: child('i.fa-beat.fa-star'),
  },
  {
    type: 'icon', name: 'animation-fade', kind: 'network-free',
    config: { ...star, animation: 'fade' },
    expect: child('i.fa-fade.fa-star'),
  },
  {
    type: 'icon', name: 'animation-beat-fade', kind: 'network-free',
    config: { ...star, animation: 'beat-fade' },
    expect: child('i.fa-beat-fade.fa-star'),
  },
  {
    type: 'icon', name: 'animation-bounce', kind: 'network-free',
    config: { ...star, animation: 'bounce' },
    expect: child('i.fa-bounce.fa-star'),
  },
  {
    type: 'icon', name: 'animation-shake', kind: 'network-free',
    config: { ...star, animation: 'shake' },
    expect: child('i.fa-shake.fa-star'),
  },
  {
    // animation 'flip' → fa-flip; distinct from the `flip` config field
    // (fa-flip-horizontal / -vertical / -both) covered separately below.
    type: 'icon', name: 'animation-flip', kind: 'network-free',
    config: { ...star, animation: 'flip' },
    expect: child('i.fa-flip.fa-star'),
  },

  // -- color (inline color on the glyph) --
  {
    type: 'icon', name: 'color', kind: 'network-free',
    config: { ...star, color: '#ff0000' },
    expect: redStyle('i', 'color'),
  },

  // -- rotation (fa-rotate-<deg> class, one per non-default degree) --
  {
    type: 'icon', name: 'rotation-90', kind: 'network-free',
    config: { ...star, rotation: 90 },
    expect: child('i.fa-rotate-90.fa-star'),
  },
  {
    type: 'icon', name: 'rotation-180', kind: 'network-free',
    config: { ...star, rotation: 180 },
    expect: child('i.fa-rotate-180.fa-star'),
  },
  {
    type: 'icon', name: 'rotation-270', kind: 'network-free',
    config: { ...star, rotation: 270 },
    expect: child('i.fa-rotate-270.fa-star'),
  },

  // -- flip (FLIP_CLASS member; one row suffices per IconFlip decision) --
  {
    type: 'icon', name: 'flip-both', kind: 'network-free',
    config: { ...star, flip: 'both' },
    expect: child('i.fa-flip-both.fa-star'),
  },

  // -- animationDuration (--fa-animation-duration inline custom property) --
  {
    type: 'icon', name: 'animation-duration', kind: 'network-free',
    config: { ...star, animation: 'spin', animationDuration: 5 },
    expect: async (mod) => {
      const dur = await mod
        .locator('i')
        .first()
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--fa-animation-duration'));
      expect(dur.trim()).toBe('5s');
    },
  },

  // -- scale (autoFit off → explicit fraction drives font-size cqmin) --
  {
    type: 'icon', name: 'scale', kind: 'network-free',
    config: { ...star, autoFit: false, scale: 0.5 },
    expect: async (mod) => {
      expect(await fontSize(mod)).toBe('50cqmin');
    },
  },

  // -- autoFit (locks size to 0.85 regardless of the explicit scale) --
  {
    type: 'icon', name: 'auto-fit', kind: 'network-free',
    config: { ...star, autoFit: true, scale: 0.3 },
    expect: async (mod) => {
      expect(await fontSize(mod)).toBe('85cqmin');
    },
  },
];
