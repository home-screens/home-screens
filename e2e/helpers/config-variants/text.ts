import { expect } from '@playwright/test';
import type { ConfigVariant } from './types';
import { has, matches, notMatches, child } from './shared';

/**
 * TEXT module config-variant rows. Every field is verified against TextConfig
 * (src/types/config.ts) and every asserted selector/style against the component
 * source (src/components/modules/TextModule.tsx + text/build-text-style.ts +
 * text/keyframes.ts). The module commits style knobs to inline styles on the
 * text <span> and injects per-instance @keyframes into a single <style> tag, so
 * rows assert computed CSS for resolved values and raw style text for
 * animation-name / palette references that never surface in computed style.
 *
 * Every text row is network-free: the module renders purely from config.
 */
export const TEXT_VARIANTS: ConfigVariant[] = [
  // -- alignment + verticalAlign (both geometry; one render proves both) --
  {
    type: 'text', name: 'alignment-vertical', kind: 'network-free',
    config: { content: 'E2E ALIGN', alignment: 'right', verticalAlign: 'top' },
    expect: async (mod) => {
      // ModuleWrapper also carries `w-full h-full overflow-hidden`; the inner
      // layout container is the only element with justify-content inline.
      const container = mod.locator('div[style*="justify-content"]').first();
      await expect(container).toHaveCSS('justify-content', 'flex-start'); // verticalAlign: top
      await expect(container).toHaveCSS('align-items', 'flex-end');       // alignment: right
      await expect(mod.locator('span', { hasText: 'E2E ALIGN' }).first()).toHaveCSS('text-align', 'right');
    },
  },

  // -- autoFit: mounts a hidden aria-hidden measurement div --
  {
    type: 'text', name: 'auto-fit', kind: 'network-free',
    config: { content: 'E2E AUTOFIT', autoFit: true },
    expect: child('div[aria-hidden="true"]'),
  },

  // -- typography cluster: letterSpacing + italic + lineHeight + wordSpacing --
  // (font weight moved to ModuleStyle.fontWeight; covered by the PropertyPanel
  // Style tests in e2e/editor/config-editing.spec.ts)
  {
    type: 'text', name: 'typography', kind: 'network-free',
    config: { content: 'E2E TYPO', letterSpacing: 4, italic: true, lineHeight: 2, wordSpacing: 8 },
    expect: async (mod) => {
      const span = mod.locator('span', { hasText: 'E2E TYPO' }).first();
      await expect(span).toHaveCSS('letter-spacing', '4px');
      await expect(span).toHaveCSS('font-style', 'italic');
      await expect(span).toHaveCSS('word-spacing', '8px');
      // Unitless line-height resolves to px in computed style, so assert the inline value.
      await expect(span).toHaveAttribute('style', /line-height:\s*2\b/);
    },
  },

  // -- fontFamily: registry id resolves to its CSS stack on the span --
  {
    type: 'text', name: 'font-family', kind: 'network-free',
    config: { content: 'E2E FONT', fontFamily: 'georgia' },
    expect: async (mod) => {
      const span = mod.locator('span', { hasText: 'E2E FONT' }).first();
      const style = (await span.getAttribute('style')) || '';
      expect(style).toContain('Georgia');
    },
  },

  // -- icon: emoji prefix renders ahead of the text --
  {
    type: 'text', name: 'icon-prefix', kind: 'network-free',
    config: { content: 'E2E ICON', icon: '🔥' },
    expect: has('🔥'),
  },

  // -- maxWidth: clamps the inline-flex content block --
  {
    type: 'text', name: 'max-width', kind: 'network-free',
    config: { content: 'E2E MAXWIDTH with some longer text', maxWidth: 200 },
    expect: async (mod) => {
      await expect(mod.locator('div[style*="max-width"]').first()).toHaveCSS('max-width', '200px');
    },
  },

  // -- wrapMode: 'balance' sets the text-wrap longhand inline --
  {
    type: 'text', name: 'wrap-balance', kind: 'network-free',
    config: { content: 'E2E BALANCE across multiple words here', wrapMode: 'balance' },
    expect: async (mod) => {
      await expect(mod.locator('span', { hasText: 'E2E BALANCE' }).first()).toHaveAttribute('style', /text-wrap:\s*balance/);
    },
  },

  // -- textBackground + textBackgroundPadding + textBackgroundRadius --
  {
    type: 'text', name: 'text-background', kind: 'network-free',
    config: { content: 'E2E BG', textBackground: '#ff0000', textBackgroundPadding: 10, textBackgroundRadius: 12 },
    expect: async (mod) => {
      const span = mod.locator('span[style*="border-radius"]').first();
      await expect(span).toBeAttached();
      const s = await span.evaluate((el) => {
        const c = getComputedStyle(el);
        return { bg: c.backgroundColor, radius: c.borderTopLeftRadius, pt: c.paddingTop, pl: c.paddingLeft };
      });
      expect(s.bg.replace(/\s/g, '')).toMatch(/^rgba?\(255,0,0/); // textBackground
      expect(s.radius).toBe('12px');                              // textBackgroundRadius
      expect(s.pt).toBe('10px');                                  // textBackgroundPadding (vertical)
      expect(s.pl).toBe('15px');                                  // padding * 1.5 (horizontal)
    },
  },

  // -- textDecoration + textDecorationColor + textDecorationThickness --
  {
    type: 'text', name: 'text-decoration', kind: 'network-free',
    config: { content: 'E2E DECO', textDecoration: 'underline', textDecorationColor: '#ff0000', textDecorationThickness: 3 },
    expect: async (mod) => {
      const span = mod.locator('span', { hasText: 'E2E DECO' }).first();
      await expect(span).toHaveCSS('text-decoration-line', 'underline');
      await expect(span).toHaveCSS('text-decoration-thickness', '3px');
      const color = await span.evaluate((el) => getComputedStyle(el).textDecorationColor);
      expect(color.replace(/\s/g, '')).toMatch(/^rgba?\(255,0,0/);
    },
  },

  // -- gradientAngle: angle flows into the linear-gradient background-image --
  {
    type: 'text', name: 'gradient-angle', kind: 'network-free',
    config: { content: 'E2E ANGLE', gradientEnabled: true, gradientFrom: '#a78bfa', gradientTo: '#22d3ee', gradientAngle: 45 },
    expect: async (mod) => {
      await expect(mod.locator('span[data-text-gradient]').first()).toHaveAttribute('style', /linear-gradient\(45deg/);
    },
  },

  // -- showDividers + accentColor (accent tints the divider bars) --
  {
    type: 'text', name: 'dividers-accent', kind: 'network-free',
    config: { content: 'E2E DIVIDERS', showDividers: true, accentColor: '#ff0000' },
    expect: async (mod) => {
      // Divider bars are 2px-tall, 1px-radius divs; match on computed style so
      // the assertion is independent of inline-style-attribute serialization.
      const bgs = await mod.locator('div').evaluateAll((els) =>
        els
          .filter((el) => {
            const c = getComputedStyle(el);
            return c.height === '2px' && c.borderTopLeftRadius === '1px';
          })
          .map((el) => getComputedStyle(el).backgroundColor),
      );
      expect(bgs).toHaveLength(2); // top + bottom divider
      expect(bgs[0].replace(/\s/g, '')).toMatch(/^rgba?\(255,0,0/); // accentColor tints the bars
    },
  },

  // -- dropCapColor: injected ::first-letter rule carries the color --
  {
    type: 'text', name: 'drop-cap-color', kind: 'network-free',
    config: { content: 'Elegant drop cap paragraph.', dropCap: true, dropCapColor: '#ff0000' },
    expect: async (mod) => {
      const css = (await mod.locator('style').first().textContent()) || '';
      expect(css).toContain('::first-letter');
      expect(css).toContain('color: #ff0000');
    },
  },

  // -- animationSpeed: seconds flow into the effect animation shorthand --
  {
    type: 'text', name: 'animation-speed', kind: 'network-free',
    config: { content: 'E2E SPEED', effect: 'glow', animationSpeed: 7 },
    expect: async (mod) => {
      await expect(mod.locator('span', { hasText: 'E2E SPEED' }).first()).toHaveAttribute('style', /_textGlow 7s/);
    },
  },

  // -- marqueeDirection + marqueeSpeed --
  {
    type: 'text', name: 'marquee-up-speed', kind: 'network-free',
    config: { content: 'E2E MARQUEE UP', marquee: true, marqueeDirection: 'up', marqueeSpeed: 12 },
    expect: child('[style*="_marqueeUp 12s"]'),
  },

  // -- orientation: 'sideways' (vertical-rl WITHOUT upright, unlike 'vertical') --
  {
    type: 'text', name: 'orientation-sideways', kind: 'network-free',
    config: { content: 'E2E SIDEWAYS', orientation: 'sideways' },
    expect: async (mod) => {
      const span = mod.locator('span[style*="vertical-rl"]').first();
      await expect(span).toBeAttached();
      const style = (await span.getAttribute('style')) || '';
      expect(style).not.toContain('upright'); // 'vertical' would add text-orientation: upright
    },
  },

  // ---- Effect discriminators (one row each; wave/glow/typewriter live in core) ----
  {
    type: 'text', name: 'effect-fade-in', kind: 'network-free',
    config: { content: 'E2E FADEIN', effect: 'fade-in' },
    expect: child('[style*="_textFadeIn"]'),
  },
  {
    type: 'text', name: 'effect-gradient-sweep', kind: 'network-free',
    config: { content: 'E2E SWEEP', effect: 'gradient-sweep', gradientEnabled: true, gradientFrom: '#a78bfa', gradientTo: '#22d3ee' },
    expect: async (mod) => {
      await expect(mod.locator('span[data-text-gradient]').first()).toHaveAttribute('style', /_textGradientSweep/);
    },
  },
  {
    // effect: 'outline' also proves outlineWidth + outlineColor.
    type: 'text', name: 'effect-outline', kind: 'network-free',
    config: { content: 'E2E OUTLINE', effect: 'outline', outlineWidth: 3, outlineColor: '#ff0000' },
    expect: async (mod) => {
      const span = mod.locator('span', { hasText: 'E2E OUTLINE' }).first();
      const s = await span.evaluate((el) => {
        const c = getComputedStyle(el);
        return { w: c.getPropertyValue('-webkit-text-stroke-width'), col: c.getPropertyValue('-webkit-text-stroke-color') };
      });
      expect(s.w).toBe('3px');                             // outlineWidth
      expect(s.col.replace(/\s/g, '')).toMatch(/rgba?\(255,0,0/); // outlineColor
    },
  },
  {
    // effect: 'shadow' also proves shadowOffsetX/Y + shadowBlur + shadowColor.
    type: 'text', name: 'effect-shadow', kind: 'network-free',
    config: { content: 'E2E SHADOW', effect: 'shadow', shadowOffsetX: 5, shadowOffsetY: 7, shadowBlur: 3, shadowColor: '#ff0000' },
    expect: async (mod) => {
      await expect(mod.locator('span', { hasText: 'E2E SHADOW' }).first()).toHaveAttribute('style', /text-shadow:\s*5px 7px 3px #ff0000/i);
    },
  },
  {
    type: 'text', name: 'effect-3d', kind: 'network-free',
    config: { content: 'E2E 3D', effect: '3d', accentColor: '#ff0000' },
    expect: async (mod) => {
      // 3d stacks six offset layers; assert the deepest one lands with the accent color.
      await expect(mod.locator('span', { hasText: 'E2E 3D' }).first()).toHaveAttribute('style', /6px 6px 0 #ff0000/i);
    },
  },
  {
    type: 'text', name: 'effect-neon', kind: 'network-free',
    config: { content: 'E2E NEON', effect: 'neon' },
    expect: async (mod) => {
      await expect(mod.locator('span', { hasText: 'E2E NEON' }).first()).toHaveAttribute('style', /_textNeonFlicker/);
    },
  },
  {
    type: 'text', name: 'effect-bounce', kind: 'network-free',
    config: { content: 'E2E BOUNCE', effect: 'bounce' },
    expect: child('span[style*="_textBounce"]'),
  },
  {
    type: 'text', name: 'effect-shake', kind: 'network-free',
    config: { content: 'E2E SHAKE', effect: 'shake' },
    expect: child('span[style*="_textShake"]'),
  },
  {
    // effect: 'color-cycle' also proves colorCyclePalette (palette colors land in the keyframe).
    type: 'text', name: 'effect-color-cycle', kind: 'network-free',
    config: { content: 'E2E CYCLE', effect: 'color-cycle', colorCyclePalette: ['#ff0000', '#00ff00'] },
    expect: async (mod) => {
      const css = (await mod.locator('style').first().textContent()) || '';
      expect(css).toContain('_textColorCycle_'); // per-instance keyframe emitted
      expect(css).toContain('#ff0000');           // first palette entry
      await expect(mod.locator('span', { hasText: 'E2E CYCLE' }).first()).toHaveAttribute('style', /_textColorCycle_/);
    },
  },

  // ---- Content rotation feature (real behavior test, not a style check) ----
  {
    type: 'text', name: 'rotation-cycle', kind: 'network-free',
    config: { content: 'ITEM ALPHA||ITEM BETA', rotationEnabled: true, rotationSeparator: '||', rotationIntervalMs: 400 },
    expect: async (mod) => {
      // Both items surface as the index cycles (each auto-retries within the timeout).
      await has('ITEM ALPHA')(mod);
      await matches(/ITEM BETA/)(mod);
    },
  },
  {
    // revealOnRotation applies a reveal animation to the rotating content wrapper.
    type: 'text', name: 'reveal-on-rotation', kind: 'network-free',
    config: { content: 'ALPHA||BETA', rotationEnabled: true, rotationSeparator: '||', rotationIntervalMs: 5000, revealOnRotation: 'fade' },
    expect: child('[style*="_textRevealFade"]'),
  },

  // ---- Template variables & shared-state tokens ----
  {
    type: 'text', name: 'template-time', kind: 'network-free',
    config: { content: 'Now: {{time}}', templateVariables: true },
    expect: async (mod) => {
      await matches(/Now:\s*\d{1,2}:\d{2}/)(mod); // substituted clock
      await notMatches(/\{\{time\}\}/)(mod);       // literal token gone
    },
  },
  {
    // Unknown shared-state key with no producer resolves to the en-dash placeholder.
    type: 'text', name: 'shared-state-unknown', kind: 'network-free',
    config: { content: 'Val: {plugin:ha:unknown}' },
    expect: async (mod) => {
      await has('Val: –')(mod);          // en dash placeholder for the unknown key
      await notMatches(/\{plugin/)(mod);       // raw token consumed
    },
  },
];
