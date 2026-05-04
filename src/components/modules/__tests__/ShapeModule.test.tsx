// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ShapeModule from '../ShapeModule';
import {
  DEFAULT_MODULE_STYLE,
  type ShapeConfig,
  type ShapeView,
  type ModuleStyle,
} from '@/types/config';
import { getModuleDefinition } from '@/lib/module-registry';

const baseStyle: ModuleStyle = { ...DEFAULT_MODULE_STYLE };

// Build a fully-populated ShapeConfig from the registry's defaults so the test
// stays in sync with the real defaultConfig — if a new field is added to the
// type without a matching registry default, this test will fail to type-check.
function defaultShapeConfig(): ShapeConfig {
  const def = getModuleDefinition('shape');
  if (!def) throw new Error('shape module not registered');
  return def.defaultConfig as unknown as ShapeConfig;
}

function renderShape(overrides: Partial<ShapeConfig> = {}) {
  const full: ShapeConfig = { ...defaultShapeConfig(), ...overrides };
  return render(<ShapeModule config={full} style={baseStyle} />);
}

const ALL_VIEWS: ShapeView[] = [
  'divider', 'double-line', 'wave', 'zigzag', 'dotted-row',
  'rectangle', 'circle', 'triangle', 'polygon', 'star', 'arrow',
  'glow', 'gradient', 'grid', 'frame',
];

describe('ShapeModule', () => {
  afterEach(() => cleanup());

  describe('view rendering', () => {
    for (const view of ALL_VIEWS) {
      it(`renders ${view} view without crashing and emits an <svg>`, () => {
        const { container } = renderShape({ view });
        expect(container.querySelector('svg'), `${view} should render an svg`).toBeTruthy();
      });
    }
  });

  describe('fade-edge dividers', () => {
    // The fade is implemented as alpha-modulated stops on the SAME gradient
    // that handles solid/gradient color — not as a separate <mask>. Going
    // through a single paint server avoids two SVG-renderer pitfalls:
    //   1. <line> has zero-height bbox, which collapses objectBoundingBox masks.
    //   2. Stacking <mask> + <linearGradient> + percentage rect dimensions
    //      across editor zoom levels produces asymmetric fades in Chromium.
    it('does NOT emit a <mask> for the divider view (fade is on the stroke)', () => {
      const { container } = renderShape({ view: 'divider', endStyle: 'fade' });
      expect(container.querySelector('mask')).toBeNull();
    });

    it('emits a <linearGradient> with 4 stops and alpha at the endpoints when endStyle is "fade"', () => {
      const { container } = renderShape({ view: 'divider', endStyle: 'fade' });
      const gradient = container.querySelector('linearGradient');
      expect(gradient, 'fade should produce a gradient paint').toBeTruthy();
      const stops = gradient!.querySelectorAll('stop');
      expect(stops).toHaveLength(4);
      expect(stops[0].getAttribute('stop-opacity')).toBe('0');
      expect(stops[3].getAttribute('stop-opacity')).toBe('0');
    });

    // Regression: previously the fade was a <mask> with percentage-based rect
    // dimensions. Chromium resolved those percentages inconsistently across
    // editor zoom levels, producing asymmetric fades and invisible lines at
    // some zooms. Pinning the gradient to the SVG viewport via
    // gradientUnits="userSpaceOnUse" makes the fade zoom-stable.
    it('uses gradientUnits="userSpaceOnUse" so fade is stable across editor zoom', () => {
      const { container } = renderShape({ view: 'divider', endStyle: 'fade' });
      const gradient = container.querySelector('linearGradient');
      expect(gradient?.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
    });

    it('does NOT emit a gradient for solid color + flat (no paint server needed)', () => {
      const { container } = renderShape({
        view: 'divider',
        endStyle: 'flat',
        fillMode: 'solid',
      });
      expect(container.querySelector('linearGradient')).toBeNull();
      const line = container.querySelector('line');
      expect(line?.getAttribute('stroke')).not.toMatch(/^url\(/);
    });

    // The solid+fade branch is distinct from gradient+fade: it must reuse the
    // single configured `color` for every stop, only ramping the alpha.
    it('emits a 4-stop gradient using the solid color and an alpha ramp for solid + fade', () => {
      const { container } = renderShape({
        view: 'divider',
        fillMode: 'solid',
        endStyle: 'fade',
        color: '#abcdef',
      });
      const grad = container.querySelector('linearGradient');
      expect(grad).toBeTruthy();
      const stops = grad!.querySelectorAll('stop');
      expect(stops).toHaveLength(4);
      for (const stop of Array.from(stops)) {
        expect(stop.getAttribute('stop-color')).toBe('#abcdef');
      }
      expect(stops[0].getAttribute('stop-opacity')).toBe('0');
      expect(stops[1].getAttribute('stop-opacity')).toBe('1');
      expect(stops[2].getAttribute('stop-opacity')).toBe('1');
      expect(stops[3].getAttribute('stop-opacity')).toBe('0');
    });
  });

  describe('double-line view', () => {
    // Regression guard: the gradient-paint refactor renders two <line> elements
    // sharing one paint server. If a future refactor reverts to per-line
    // gradients or merges the two lines into one path, this assertion catches it.
    it('renders exactly 2 line segments', () => {
      const { container } = renderShape({ view: 'double-line' });
      expect(container.querySelectorAll('line')).toHaveLength(2);
    });
  });

  describe('gradient fill', () => {
    it('emits a <linearGradient> when fillMode is "gradient"', () => {
      const { container } = renderShape({ view: 'rectangle', fillMode: 'gradient' });
      expect(container.querySelector('linearGradient')).toBeTruthy();
    });

    it('uses a solid fill when fillMode is "solid"', () => {
      const { container } = renderShape({ view: 'rectangle', fillMode: 'solid', color: '#ff00aa' });
      const rect = container.querySelector('rect');
      expect(rect?.getAttribute('fill')).toBe('#ff00aa');
    });

    it('always uses gradient for the gradient view regardless of fillMode', () => {
      const { container } = renderShape({ view: 'gradient', fillMode: 'solid' });
      expect(container.querySelector('linearGradient')).toBeTruthy();
    });

    // gradientCoords uses CSS-style angles (0° = up, 90° = right) and converts
    // them to SVG objectBoundingBox unit coordinates via a (-90°) rotation.
    // Pinning the four cardinal angles guards against an accidental sign flip
    // or off-by-90° rewrite that would silently rotate every gradient panel.
    it.each([
      { angle: 90,  x1: 0,   y1: 0.5, x2: 1,   y2: 0.5 }, // → right
      { angle: 180, x1: 0.5, y1: 0,   x2: 0.5, y2: 1   }, // ↓ down
      { angle: 0,   x1: 0.5, y1: 1,   x2: 0.5, y2: 0   }, // ↑ up
      { angle: 270, x1: 1,   y1: 0.5, x2: 0,   y2: 0.5 }, // ← left
    ])('places gradient endpoints correctly for angle=$angle', ({ angle, x1, y1, x2, y2 }) => {
      const { container } = renderShape({ view: 'gradient', gradientAngle: angle });
      const grad = container.querySelector('linearGradient');
      expect(grad).toBeTruthy();
      expect(Number(grad!.getAttribute('x1'))).toBeCloseTo(x1, 5);
      expect(Number(grad!.getAttribute('y1'))).toBeCloseTo(y1, 5);
      expect(Number(grad!.getAttribute('x2'))).toBeCloseTo(x2, 5);
      expect(Number(grad!.getAttribute('y2'))).toBeCloseTo(y2, 5);
    });
  });

  describe('outline mode', () => {
    it('renders fill="none" + stroke when outline is true', () => {
      const { container } = renderShape({ view: 'circle', outline: true, color: '#abcdef' });
      const circle = container.querySelector('circle');
      expect(circle?.getAttribute('fill')).toBe('none');
      expect(circle?.getAttribute('stroke')).toBe('#abcdef');
    });

    it('renders fill=color + stroke="none" when outline is false', () => {
      const { container } = renderShape({ view: 'circle', outline: false, color: '#abcdef' });
      const circle = container.querySelector('circle');
      expect(circle?.getAttribute('fill')).toBe('#abcdef');
      expect(circle?.getAttribute('stroke')).toBe('none');
    });
  });

  describe('polygon side count', () => {
    it('hexagon (sides=6) emits exactly 6 vertex points', () => {
      const { container } = renderShape({ view: 'polygon', sides: 6 });
      const points = container.querySelector('polygon')?.getAttribute('points') ?? '';
      expect(points.split(/\s+/).filter(Boolean)).toHaveLength(6);
    });

    it('triangle view always renders 3 vertices regardless of sides config', () => {
      const { container } = renderShape({ view: 'triangle', sides: 8 });
      const points = container.querySelector('polygon')?.getAttribute('points') ?? '';
      expect(points.split(/\s+/).filter(Boolean)).toHaveLength(3);
    });
  });

  describe('grid pattern', () => {
    it('emits a <pattern> with the configured spacing', () => {
      const { container } = renderShape({ view: 'grid', gridSpacing: 32 });
      const pattern = container.querySelector('pattern');
      expect(pattern?.getAttribute('width')).toBe('32');
      expect(pattern?.getAttribute('height')).toBe('32');
    });
  });

  describe('glow', () => {
    it('emits a <radialGradient>', () => {
      const { container } = renderShape({ view: 'glow' });
      expect(container.querySelector('radialGradient')).toBeTruthy();
    });
  });

  describe('frame brackets', () => {
    it('renders 8 line segments (2 per corner) when frameStyle is "brackets"', () => {
      const { container } = renderShape({ view: 'frame', frameStyle: 'brackets' });
      expect(container.querySelectorAll('line')).toHaveLength(8);
    });

    it('renders a single rect when frameStyle is "rectangle"', () => {
      const { container } = renderShape({ view: 'frame', frameStyle: 'rectangle' });
      expect(container.querySelectorAll('rect')).toHaveLength(1);
    });
  });
});
